import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');
const BASE_URL = 'https://www.bike.go.kr';

/**
 * 자전거행복나눔 (bike.go.kr) 크롤러
 * 국토교통부 공식 자전거길 GPX 데이터 수집
 */
export class BikeGoKrCrawler implements Crawler {
  source = 'bike-go-kr' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    const browser = await puppeteer.launch({ headless: true });

    try {
      const page = await browser.newPage();

      // 자전거길 코스 목록 페이지로 이동
      await page.goto(`${BASE_URL}/path/path.do`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // 코스 목록에서 GPX 다운로드 링크 추출
      const courseLinks = await page.evaluate(() => {
        const links: { name: string; url: string }[] = [];
        // 실제 페이지 구조에 따라 셀렉터 조정 필요
        const items = document.querySelectorAll('.course-list .course-item, .path-list li');
        items.forEach((item) => {
          const nameEl = item.querySelector('.title, .name, h3, a');
          const downloadEl = item.querySelector('a[href*="gpx"], a[href*="download"]');
          if (nameEl && downloadEl) {
            links.push({
              name: nameEl.textContent?.trim() || '알 수 없는 코스',
              url: (downloadEl as HTMLAnchorElement).href,
            });
          }
        });
        return links;
      });

      for (const course of courseLinks) {
        try {
          const fileName = `bike-go-kr_${sanitizeFileName(course.name)}.gpx`;
          const filePath = path.join(DATA_DIR, fileName);

          // GPX 파일 다운로드
          const response = await page.goto(course.url, { waitUntil: 'networkidle2' });
          const content = await response?.text();

          if (content && content.includes('<gpx')) {
            fs.writeFileSync(filePath, content, 'utf-8');
            results.push({
              source: this.source,
              filePath,
              originalUrl: course.url,
              name: course.name,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[bike.go.kr] 다운로드 완료: ${course.name}`);
          }
        } catch (err) {
          console.error(`[bike.go.kr] 다운로드 실패: ${course.name}`, err);
        }
      }
    } finally {
      await browser.close();
    }

    console.log(`[bike.go.kr] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}
