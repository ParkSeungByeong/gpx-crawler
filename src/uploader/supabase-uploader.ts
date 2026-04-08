import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import type { ParsedCourse, CourseRow } from '../types';

let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.'
      );
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

/**
 * 파싱된 코스 데이터를 Supabase courses 테이블에 업로드
 */
export async function uploadCourse(course: ParsedCourse, gpxFilePath?: string): Promise<boolean> {
  try {
    const client = getSupabase();

    const row: CourseRow = {
      name: course.name,
      description: course.description,
      source: course.source,
      source_url: course.sourceUrl,
      coordinates: course.trackPoints.map((p) => [p.lon, p.lat]),
      distance: Math.round(course.distance * 10) / 10,
      elevation_gain: course.elevationGain,
      elevation_loss: course.elevationLoss,
      min_elevation: course.minElevation,
      max_elevation: course.maxElevation,
      region: course.region,
      difficulty: course.difficulty,
    };

    // 원본 GPX 데이터 첨부
    if (gpxFilePath && fs.existsSync(gpxFilePath)) {
      row.gpx_data = fs.readFileSync(gpxFilePath, 'utf-8');
    }

    // upsert: source + name 기준 중복 방지
    const { error } = await client
      .from('courses')
      .upsert(row, { onConflict: 'source,name' });

    if (error) {
      console.error(`[upload] 업로드 실패: ${course.name}`, error.message);
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
