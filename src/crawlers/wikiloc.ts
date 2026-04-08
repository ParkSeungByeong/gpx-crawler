import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const SEARCH_KEYWORDS = [
  'seoul cycling',
  'jeju cycling',
  'busan cycling',
  'korea bike',
  'han river bike',
];

/**
 * Wikiloc 공개 트레일 크롤러
 * 트레일 목록에서 공개 GPX 데이터 수집 시도
 */
export class WikilocCrawler implements Crawler {
  source = 'wikiloc' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    fs.mkdirSync(DATA_DIR, { recursive: true });

    for (const keyword of SEARCH_KEYWORDS) {
      try {
        const searchUrl = `https://www.wikiloc.com/trails/cycling?q=${encodeURIComponent(keyword)}&sw=33.0,124.0&ne=39.0,132.0`;
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
          },
        });

        if (!response.ok) {
          console.warn(`[wikiloc] 검색 실패 (${response.status}): ${keyword}`);
          continue;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // 트레일 링크 추출
        const trailLinks: { id: string; name: string; url: string }[] = [];
        $('a[href*="/cycling-trails/"]').each((_, el) => {
          const href = $(el).attr('href') || '';
          // /photo- URL은 제외
          if (href.includes('/photo-')) return;
          const match = href.match(/cycling-trails\/([^/]+)-(\d+)$/);
          if (match) {
            const name = $(el).text().trim() || match[1].replace(/-/g, ' ');
            const id = match[2];
            // 중복 제거
            if (!trailLinks.some((t) => t.id === id)) {
              trailLinks.push({
                id,
                name,
                url: `https://www.wikiloc.com${href}`,
              });
            }
          }
        });

        console.log(`[wikiloc] "${keyword}" 검색: ${trailLinks.length}개 트레일 발견`);

        // 각 트레일 상세 페이지에서 GPX 다운로드 시도
        for (const trail of trailLinks.slice(0, 5)) {
          try {
            const gpxUrl = `https://www.wikiloc.com/wikiloc/download.do?id=${trail.id}`;
            const gpxResponse = await fetch(gpxUrl, {
              headers: { 'User-Agent': BROWSER_UA },
              redirect: 'manual',
            });

            // 로그인 리다이렉트 발생 시 스킵
            if (gpxResponse.status === 301 || gpxResponse.status === 302) {
              continue;
            }

            if (!gpxResponse.ok) continue;

            const gpxContent = await gpxResponse.text();
            if (!gpxContent.includes('<gpx')) continue;

            const fileName = `wikiloc_${trail.id}_${sanitizeFileName(trail.name)}.gpx`;
            const filePath = path.join(DATA_DIR, fileName);
            fs.writeFileSync(filePath, gpxContent, 'utf-8');

            results.push({
              source: this.source,
              filePath,
              originalUrl: trail.url,
              name: trail.name,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[wikiloc] 다운로드 완료: ${trail.name}`);
          } catch (err) {
            // 개별 트레일 실패는 무시
          }
        }

        await delay(2000);
      } catch (err) {
        console.error(`[wikiloc] 검색 실패: ${keyword}`, err);
      }
    }

    if (results.length === 0) {
      console.warn('[wikiloc] GPX 다운로드에는 Wikiloc 계정 로그인이 필요할 수 있습니다.');
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
