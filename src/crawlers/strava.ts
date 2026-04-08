import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');

// 한국 주요 자전거길 관련 검색 키워드
const SEARCH_KEYWORDS = [
  '한강 자전거길',
  '낙동강 자전거길',
  '영산강 자전거길',
  '금강 자전거길',
  '새재 자전거길',
  '제주 자전거길',
  '동해안 자전거길',
  '서해안 자전거길',
  '국토종주',
  'Korea cycling',
  'Seoul bike path',
  'Jeju cycling',
];

/**
 * Strava 공개 루트/세그먼트 크롤러
 * 한국 자전거길 관련 공개 루트에서 GPX 수집
 */
export class StravaCrawler implements Crawler {
  source = 'strava' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        // Strava 공개 루트 검색 (로그인 불필요한 공개 페이지)
        const searchUrl = `https://www.strava.com/routes/search?utf8=%E2%9C%93&query=${encodeURIComponent(keyword)}&location=South+Korea`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
            'Accept': 'text/html',
          },
        });

        if (!response.ok) {
          console.warn(`[strava] 검색 실패 (${response.status}): ${keyword}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 공개 루트 링크 추출
        const routeLinks: { id: string; name: string }[] = [];
        $('a[href*="/routes/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          const match = href.match(/\/routes\/(\d+)/);
          if (match) {
            routeLinks.push({
              id: match[1],
              name: $(el).text().trim() || `strava_route_${match[1]}`,
            });
          }
        });

        // 각 루트의 GPX 다운로드 시도
        for (const route of routeLinks.slice(0, 10)) {
          try {
            const gpxUrl = `https://www.strava.com/routes/${route.id}/export_gpx`;
            const gpxResponse = await fetch(gpxUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; gpx-crawler/1.0)',
              },
            });

            if (!gpxResponse.ok) continue;

            const gpxContent = await gpxResponse.text();
            if (!gpxContent.includes('<gpx')) continue;

            const fileName = `strava_${route.id}_${sanitizeFileName(route.name)}.gpx`;
            const filePath = path.join(DATA_DIR, fileName);
            fs.writeFileSync(filePath, gpxContent, 'utf-8');

            results.push({
              source: this.source,
              filePath,
              originalUrl: `https://www.strava.com/routes/${route.id}`,
              name: route.name,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[strava] 다운로드 완료: ${route.name}`);
          } catch (err) {
            console.error(`[strava] 루트 다운로드 실패: ${route.id}`, err);
          }
        }

        // Rate limiting
        await delay(2000);
      } catch (err) {
        console.error(`[strava] 검색 실패: ${keyword}`, err);
      }
    }

    console.log(`[strava] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
