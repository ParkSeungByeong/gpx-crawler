import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');
const API_BASE = 'https://apis.data.go.kr/B553982';

/**
 * 공공데이터포털 (data.go.kr) 크롤러
 * 자전거코스 관련 공공 API 데이터셋 수집
 */
export class DataGoKrCrawler implements Crawler {
  source = 'data-go-kr' as const;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DATA_GO_KR_API_KEY || '';
    if (!this.apiKey) {
      console.warn('[data.go.kr] DATA_GO_KR_API_KEY가 설정되지 않았습니다. 스킵합니다.');
    }
  }

  async crawl(): Promise<CrawlResult[]> {
    if (!this.apiKey) return [];

    const results: CrawlResult[] = [];

    try {
      // 자전거길 코스 목록 조회
      const listUrl = `${API_BASE}/bicycle/courseList?serviceKey=${encodeURIComponent(this.apiKey)}&numOfRows=100&pageNo=1&type=json`;
      const listResponse = await fetch(listUrl);
      const listData: any = await listResponse.json();

      const items = listData?.response?.body?.items?.item || [];

      for (const item of items) {
        try {
          const courseId = item.courseId || item.id;
          const courseName = item.courseName || item.name || `course_${courseId}`;

          // 코스 상세 GPX 데이터 조회
          const detailUrl = `${API_BASE}/bicycle/courseDetail?serviceKey=${encodeURIComponent(this.apiKey)}&courseId=${courseId}&type=xml`;
          const detailResponse = await fetch(detailUrl);
          const gpxContent = await detailResponse.text();

          if (gpxContent && (gpxContent.includes('<gpx') || gpxContent.includes('<trk'))) {
            const fileName = `data-go-kr_${sanitizeFileName(courseName)}.gpx`;
            const filePath = path.join(DATA_DIR, fileName);
            fs.writeFileSync(filePath, gpxContent, 'utf-8');

            results.push({
              source: this.source,
              filePath,
              originalUrl: detailUrl.replace(this.apiKey, '***'),
              name: courseName,
              crawledAt: new Date().toISOString(),
            });
            console.log(`[data.go.kr] 다운로드 완료: ${courseName}`);
          }
        } catch (err) {
          console.error(`[data.go.kr] 코스 처리 실패:`, err);
        }
      }
    } catch (err) {
      console.error('[data.go.kr] API 호출 실패:', err);
    }

    console.log(`[data.go.kr] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}
