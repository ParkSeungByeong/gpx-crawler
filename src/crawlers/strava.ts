import type { Crawler, CrawlResult } from '../types';

/**
 * Strava 공개 루트/세그먼트 크롤러
 * 참고: Strava API는 인증이 필요합니다 (STRAVA_ACCESS_TOKEN 환경변수)
 */
export class StravaCrawler implements Crawler {
  source = 'strava' as const;

  async crawl(): Promise<CrawlResult[]> {
    const token = process.env.STRAVA_ACCESS_TOKEN;
    if (!token) {
      console.warn('[strava] STRAVA_ACCESS_TOKEN이 설정되지 않았습니다. 스킵합니다.');
      console.warn('[strava] Strava API 인증이 필요합니다: https://developers.strava.com/');
      return [];
    }

    // TODO: Strava API v3를 사용한 공개 루트 수집
    console.log('[strava] 총 0개 GPX 수집 완료');
    return [];
  }
}
