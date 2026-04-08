import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');

const SEARCH_KEYWORDS = [
  'cycling korea',
  'bike seoul',
  'jeju cycling',
  '한강',
  'nakdong river bike',
  'korea bike path',
  'four rivers bike korea',
];

/**
 * Komoot 공개 루트 크롤러
 * 한국 자전거 관련 공개 투어에서 GPX 수집
 */
export class KomootCrawler implements Crawler {
  source = 'komoot' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        // Komoot discover 페이지에서 투어 검색
        const searchUrl = `https://www.komoot.com/discover?sport=cycling&query=${encodeURIComponent(keyword)}&map=35.9,127.8,7z`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
            'Accept': 'text/html',
          },
        });

        if (!response.ok) {
          console.warn(`[komoot] 검색 실패 (${response.status}): ${keyword}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 투어 링크 추출
        const tourLinks: { id: string; name: string }[] = [];
        $('a[href*="/tour/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const match = href.match(/\/tour\/(\d+)/);
          if (match) {
            tourLinks.push({
              id: match[1],
              name: $(el).text().trim() || `komoot_tour_${match[1]}`,
            });
          }
        });

        // 각 투어의 GPX 다운로드 시도
        for (const tour of tourLinks.slice(0, 10)) {
          try {
            const gpxUrl = `https://www.komoot.com/tour/${tour.id}/download`;
            const gpxResponse = await fetch(gpxUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
              },
            });

            if (!gpxResponse.ok) continue;

            const gpxContent = await gpxResponse.text();
            if (!gpxContent.includes('<gpx')) continue;

            const fileName = `komoot_${tour.id}_${sanitizeFileName(tour.name)}.gpx`;
            const filePath = path.join(DATA_DIR, fileName);
            fs.writeFileSync(filePath, gpxContent, 'utf-8');

            results.push({
              source: this.source,
              filePath,
              originalUrl: `https://www.komoot.com/tour/${tour.id}`,
              name: tour.name,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[komoot] 다운로드 완료: ${tour.name}`);
          } catch (err) {
            console.error(`[komoot] 투어 다운로드 실패: ${tour.id}`, err);
          }
        }

        await delay(2000);
      } catch (err) {
        console.error(`[komoot] 검색 실패: ${keyword}`, err);
      }
    }

    console.log(`[komoot] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
