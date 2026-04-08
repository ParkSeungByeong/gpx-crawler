import * as fs from 'fs';
import type { ParsedCourse, CourseRow } from '../types';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

/**
 * Supabase REST API를 직접 호출하여 데이터 upsert
 */
async function supabaseRequest(
  table: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_ANON_KEY) 환경변수가 필요합니다.'
    );
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const headers: Record<string, string> = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return { ok: false, error: `${response.status}: ${errorBody}` };
  }

  return { ok: true };
}

/**
 * ParsedCourse에서 시작/끝 지점 추출
 */
function getEndpoints(course: ParsedCourse): { start?: string; end?: string } {
  if (course.trackPoints.length === 0) return {};
  const first = course.trackPoints[0];
  const last = course.trackPoints[course.trackPoints.length - 1];
  return {
    start: `POINT(${first.lon.toFixed(6)} ${first.lat.toFixed(6)})`,
    end: `POINT(${last.lon.toFixed(6)} ${last.lat.toFixed(6)})`,
  };
}

/**
 * 파싱된 코스 데이터를 Supabase courses 테이블에 업로드
 */
export async function uploadCourse(course: ParsedCourse, _gpxFilePath?: string): Promise<boolean> {
  try {
    const endpoints = getEndpoints(course);

    const row: CourseRow = {
      name: course.name,
      description: course.description || `${course.source} - ${course.name}`,
      region: course.region,
      difficulty: course.difficulty,
      category: course.source,
      distance_km: Math.round(course.distance * 10) / 10,
      elevation_gain_m: course.elevationGain,
      start_point: endpoints.start,
      end_point: endpoints.end,
    };

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
