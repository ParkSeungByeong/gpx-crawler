import 'dotenv/config';
import type { ParsedCourse, CourseRow, CourseCategory, CourseDifficulty } from '../types';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Supabase REST API 직접 호출 (service_role key로 RLS 바이패스)
 */
async function supabaseRequest(
  table: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return { ok: false, error: `${response.status}: ${errorBody}` };
  }

  return { ok: true };
}

/** 코스 이름으로 카테고리 추정 */
function inferCategory(name: string): CourseCategory {
  const n = name.toLowerCase();
  if (/한강|낙동강|금강|영산강|섬진강|남한강|북한강|황강|낙동/.test(name)) return 'river_trail';
  if (/동해안|서해안|해안|거문도|원산도|선유도|한산도|우도|가파도|안면도|덕적도|영흥도|청산도|임자도|증도|자은도|강화|거제|남해|진도|울릉/.test(name)) return 'coastal';
  if (/국토종주|종주|새재/.test(name)) return 'cross_country';
  if (/팔공산|산/.test(name) && !/안산/.test(name)) return 'mountain';
  if (/서울|대구|경주|도심/.test(name)) return 'urban';
  return 'leisure';
}

/** 코스 이름으로 지역(region) 추정 */
function inferRegion(name: string, course: ParsedCourse): string {
  // 이름에서 지역 추정
  if (/서울|한강/.test(name)) return '서울';
  if (/제주|우도|가파도/.test(name)) return '제주';
  if (/강릉|경포|강원|동해안.*강원|화천|파로호/.test(name)) return '강원';
  if (/경주|포항|동해안.*경북|울릉|경북/.test(name)) return '경북';
  if (/대구|팔공산/.test(name)) return '대구';
  if (/부산/.test(name)) return '부산';
  if (/낙동강|합천|상주/.test(name)) return '경상';
  if (/금강|옥천|보령|원산도/.test(name)) return '충청';
  if (/영산강|신안|증도|자은도|임자도|완도|청산도|진도/.test(name)) return '전남';
  if (/정읍|군산|선유도|전북/.test(name)) return '전북';
  if (/아라|인천|옹진|덕적도|영흥도/.test(name)) return '인천';
  if (/남한강|북한강|경춘|안산|대부도/.test(name)) return '경기';
  if (/새재|오천/.test(name)) return '충북';
  if (/여수|거문도/.test(name)) return '전남';
  if (/남해|거제|통영|한산도/.test(name)) return '경남';
  if (/강화|갯벌/.test(name)) return '인천';
  if (/태안|안면도/.test(name)) return '충남';
  if (/섬진강/.test(name)) return '전남';

  // 좌표 기반 fallback
  if (course.trackPoints.length > 0) {
    const lat = course.trackPoints[0].lat;
    const lon = course.trackPoints[0].lon;
    if (lat > 37.4 && lon < 127.1) return '서울';
    if (lat < 33.6) return '제주';
    if (lat > 37.5 && lon > 128) return '강원';
  }

  return '전국';
}

/** difficulty 매핑 (expert 포함) */
function mapDifficulty(d?: string): CourseDifficulty {
  if (d === 'easy' || d === 'moderate' || d === 'hard' || d === 'expert') return d;
  return 'moderate';
}

/** 트랙포인트를 WKT LINESTRING으로 변환 */
function toLineStringWKT(course: ParsedCourse): string | undefined {
  if (course.trackPoints.length < 2) return undefined;
  // 포인트가 너무 많으면 샘플링 (PostGIS 성능)
  let points = course.trackPoints;
  if (points.length > 1000) {
    const step = Math.ceil(points.length / 1000);
    points = points.filter((_, i) => i % step === 0 || i === course.trackPoints.length - 1);
  }
  const coords = points.map(p => `${p.lon} ${p.lat}`).join(', ');
  return `SRID=4326;LINESTRING(${coords})`;
}

/** 시작/끝 포인트를 WKT POINT로 변환 */
function toPointWKT(lat: number, lon: number): string {
  return `SRID=4326;POINT(${lon} ${lat})`;
}

/** route_geojson 생성 */
function toGeoJSON(course: ParsedCourse): object | undefined {
  if (course.trackPoints.length < 2) return undefined;
  let points = course.trackPoints;
  if (points.length > 1000) {
    const step = Math.ceil(points.length / 1000);
    points = points.filter((_, i) => i % step === 0 || i === course.trackPoints.length - 1);
  }
  return {
    type: 'LineString',
    coordinates: points.map(p => [p.lon, p.lat]),
  };
}

/** 예상 소요 시간 (분) - 평균 15km/h 기준 */
function estimateTime(distanceKm: number): number {
  return Math.round((distanceKm / 15) * 60);
}

/**
 * 파싱된 코스 데이터를 Supabase courses 테이블에 업로드
 */
export async function uploadCourse(course: ParsedCourse, _gpxFilePath?: string): Promise<boolean> {
  try {
    const region = inferRegion(course.name, course);

    const row: CourseRow = {
      name: course.name,
      description: course.description || `자전거행복나눔 - ${course.name}`,
      region,
      category: inferCategory(course.name),
      difficulty: mapDifficulty(course.difficulty),
      distance_km: Math.round(course.distance * 100) / 100,
      elevation_gain_m: course.elevationGain,
      estimated_time_minutes: estimateTime(course.distance),
      route_geometry: toLineStringWKT(course),
      route_geojson: toGeoJSON(course),
      tags: [course.source, region, course.difficulty || 'moderate'].filter(Boolean) as string[],
      is_official: true,
    };

    if (course.trackPoints.length > 0) {
      const first = course.trackPoints[0];
      const last = course.trackPoints[course.trackPoints.length - 1];
      row.start_point = toPointWKT(first.lat, first.lon);
      row.end_point = toPointWKT(last.lat, last.lon);
    }

    const { ok, error } = await supabaseRequest('courses', row as any);

    if (!ok) {
      console.error(`[upload] 업로드 실패: ${course.name}`, error);
      return false;
    }

    console.log(`[upload] 업로드 완료: ${course.name}`);
    return true;
  } catch (err) {
    console.error(`[upload] 에러: ${course.name}`, err);
    return false;
  }
}

/**
 * 여러 코스를 일괄 업로드
 */
export async function uploadAll(
  courses: ParsedCourse[],
  gpxFilePaths?: Map<string, string>
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const course of courses) {
    const gpxPath = gpxFilePaths?.get(course.name);
    const ok = await uploadCourse(course, gpxPath);
    if (ok) success++;
    else failed++;
  }

  console.log(`[upload] 총 ${success}개 성공, ${failed}개 실패`);
  return { success, failed };
}
