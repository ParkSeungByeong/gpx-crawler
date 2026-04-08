import type { Crawler, CrawlResult } from '../types';

/**
 * Komoot 공개 루트 크롤러
 * 참고: Komoot GPX 다운로드는 인증이 필요합니다
 */
export class KomootCrawler implements Crawler {
  source = 'komoot' as const;

  async crawl(): Promise<CrawlResult[]> {
    const token = process.env.KOMOOT_TOKEN;
    if (!token) {
      console.warn('[komoot] KOMOOT_TOKEN이 설정되지 않았습니다. 스킵합니다.');
      console.warn('[komoot] Komoot API 인증이 필요합니다.');
      return [];
    }

    // TODO: Komoot API를 사용한 공개 투어 수집
    console.log('[komoot] 총 0개 GPX 수집 완료');
    return [];
  }
}
