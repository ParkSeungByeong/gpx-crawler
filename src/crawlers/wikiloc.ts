import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');

const SEARCH_KEYWORDS = [
  '자전거길 한국',
  'korea cycling',
  'seoul bike',
  'jeju bike',
  'four rivers korea',
  '국토종주',
  '한강 자전거',
  '낙동강 자전거',
];

/**
 * Wikiloc 공개 루트 크롤러
 * 한국 자전거 관련 공개 트레일에서 GPX 수집
 */
export class WikilocCrawler implements Crawler {
  source = 'wikiloc' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        // Wikiloc 트레일 검색
        const searchUrl = `https://www.wikiloc.com/trails/cycling?q=${encodeURIComponent(keyword)}&sw=33.0,124.0&ne=39.0,132.0`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
            'Accept': 'text/html',
          },
        });

        if (!response.ok) {
          console.warn(`[wikiloc] 검색 실패 (${response.status}): ${keyword}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 트레일 링크 추출
        const trailLinks: { id: string; name: string }[] = [];
        $('a[href*="/cycling-trails/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const match = href.match(/cycling-trails\/[^/]+-(\d+)/);
          if (match) {
            trailLinks.push({
              id: match[1],
              name: $(el).text().trim() || `wikiloc_trail_${match[1]}`,
            });
          }
        });

        // 각 트레일의 GPX 다운로드 시도
        for (const trail of trailLinks.slice(0, 10)) {
          try {
            const gpxUrl = `https://www.wikiloc.com/trail/${trail.id}/download-gpx`;
            const gpxResponse = await fetch(gpxUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
              },
            });

            if (!gpxResponse.ok) continue;

            const gpxContent = await gpxResponse.text();
            if (!gpxContent.includes('<gpx')) continue;

            const fileName = `wikiloc_${trail.id}_${sanitizeFileName(trail.name)}.gpx`;
            const filePath = path.join(DATA_DIR, fileName);
            fs.writeFileSync(filePath, gpxContent, 'utf-8');

            results.push({
              source: this.source,
              filePath,
              originalUrl: `https://www.wikiloc.com/trail/${trail.id}`,
              name: trail.name,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[wikiloc] 다운로드 완료: ${trail.name}`);
          } catch (err) {
            console.error(`[wikiloc] 트레일 다운로드 실패: ${trail.id}`, err);
          }
        }

        await delay(2000);
      } catch (err) {
        console.error(`[wikiloc] 검색 실패: ${keyword}`, err);
      }
    }

    console.log(`[wikiloc] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
