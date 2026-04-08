/** GPX 트랙포인트 */
export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number; // 고도 (meters)
  time?: string;
}

/** 파싱된 GPX 코스 데이터 */
export interface ParsedCourse {
  name: string;
  description?: string;
  source: CrawlSource;
  sourceUrl?: string;
  trackPoints: TrackPoint[];
  distance: number; // 총 거리 (km)
  elevationGain?: number; // 누적 상승 고도 (m)
  elevationLoss?: number; // 누적 하강 고도 (m)
  minElevation?: number;
  maxElevation?: number;
  region?: string; // 지역 (예: 서울, 경기)
  difficulty?: 'easy' | 'moderate' | 'hard';
}

/** 크롤링 소스 */
export type CrawlSource =
  | 'bike-go-kr'
  | 'data-go-kr'
  | 'strava'
  | 'komoot'
  | 'wikiloc';

/** 크롤링 결과 - 다운로드된 GPX 파일 정보 */
export interface CrawlResult {
  source: CrawlSource;
  filePath: string; // 로컬 저장 경로
  originalUrl: string;
  name: string;
  crawledAt: string; // ISO timestamp
}

/** 크롤러 인터페이스 */
export interface Crawler {
  source: CrawlSource;
  crawl(): Promise<CrawlResult[]>;
}

/** Supabase courses 테이블 행 */
export interface CourseRow {
  name: string;
  description?: string;
  source: string;
  source_url?: string;
  coordinates: [number, number][]; // [lng, lat][]
  distance: number;
  elevation_gain?: number;
  elevation_loss?: number;
  min_elevation?: number;
  max_elevation?: number;
  region?: string;
  difficulty?: string;
  gpx_data?: string; // 원본 GPX XML
}
