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

/** courses 테이블 category enum */
export type CourseCategory = 'river_trail' | 'coastal' | 'cross_country' | 'urban' | 'mountain' | 'leisure';

/** courses 테이블 difficulty enum */
export type CourseDifficulty = 'easy' | 'moderate' | 'hard' | 'expert';

/** Supabase courses 테이블 행 (schema.sql 기준) */
export interface CourseRow {
  name: string;
  description: string;
  region: string;
  category: CourseCategory;
  difficulty: CourseDifficulty;
  distance_km: number;
  elevation_gain_m?: number;
  estimated_time_minutes?: number;
  route_geometry?: string;   // WKT LINESTRING
  route_geojson?: object;
  start_point?: string;      // WKT POINT
  end_point?: string;        // WKT POINT
  tags?: string[];
  is_official?: boolean;
  thumbnail_url?: string;
}
