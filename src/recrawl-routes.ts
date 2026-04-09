import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const API_KEY = '2008148358544';
const BASE_URL = 'https://www.bike.go.kr';

/**
 * bike.go.kr roadSn → Supabase courses.name 매핑
 * bike.go.kr의 이름과 DB 이름이 다른 경우를 처리
 */
const ROAD_COURSE_MAP: Record<number, string> = {
  // 국토종주자전거길 (type 1)
  1: '아라자전거길',
  2: '한강종주자전거길(서울구간)',
  3: '남한강자전거길',
  4: '새재자전거길',
  5: '낙동강자전거길',
  6: '금강자전거길',
  7: '영산강자전거길',
  8: '북한강(경춘선)자전거길',
  9: '섬진강자전거길',
  10: '오천자전거길',
  11: '동해안자전거길(강원)',
  12: '동해안자전거길(경북)',
  13: '제주환상자전거길',
  // 지자체명품 자전거길 (type 2)
  14: '강릉 경포호 산소길',
  15: '화천 파로호 100리 산소길',
  16: '옹진 덕적도 자전거길',
  18: '옥천 향수 100리길',
  19: '정읍 정읍천 자전거길',
  20: '신안 증도 자전거섬',
  21: '경주 역사탐방 자전거길',
  // 섬 자전거길 (type 3)
  24: '강화 갯벌 자전거길',
  25: '영흥도 십리포 자전거길',
  26: '군산 선유도 자전거길',
  27: '여수 거문도 자전거길',
  30: '완도 청산도 자전거길',
  32: '진도 자전거길',
  34: '신안 증도 자전거길',
  35: '신안 임자도 자전거길',
  36: '신안 자은도 자전거길',
  41: '울릉도 자전거길',
  43: '남해 자전거길',
  45: '제주 우도 자전거길',
  46: '제주 가파도 자전거길',
};

interface LinePoint {
  lineOrdr: string;
  lineSn: number;
  roadSn: number;
  lineXp: string; // latitude
  lineYp: string; // longitude
}

interface LineResult {
  roadHeadList: string[];
  roadList: LinePoint[];
}

async function getSession(): Promise<string> {
  const res = await axios.get(`${BASE_URL}/map/roadMap.do?roadSn=1&roadType=1&key=${API_KEY}&zm=12`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    maxRedirects: 5,
  });
  const cookies = res.headers['set-cookie']?.map((c: string) => c.split(';')[0]).join('; ') || '';
  return cookies;
}

async function getLineList(roadSn: number, cookies: string): Promise<LinePoint[]> {
  const res = await axios.post(
    `${BASE_URL}/map/getLineList.do?key=${API_KEY}`,
    `roadSn=${roadSn}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies,
        Referer: `${BASE_URL}/map/roadMap.do?roadSn=${roadSn}&roadType=1&key=${API_KEY}&zm=12`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    },
  );

  const result: LineResult = res.data[0];
  if (!result || !result.roadList || result.roadList.length === 0) {
    return [];
  }

  // lineOrdr 순서대로 정렬하고 모든 포인트 합치기
  const allPoints: LinePoint[] = [];
  for (const ordr of result.roadHeadList) {
    const segmentPoints = result.roadList.filter((p) => p.lineOrdr === ordr);
    allPoints.push(...segmentPoints);
  }

  return allPoints;
}

function toGeoJSON(points: LinePoint[]): object {
  const coordinates = points.map((p) => [
    parseFloat(p.lineYp.trim()),  // longitude
    parseFloat(p.lineXp.trim()),  // latitude
  ]);

  return {
    type: 'LineString',
    crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    coordinates,
  };
}

async function main() {
  console.log('=== bike.go.kr 자전거길 상세 좌표 크롤링 시작 ===\n');

  // 1. 세션 쿠키 획득
  console.log('[1/4] 세션 쿠키 획득...');
  const cookies = await getSession();
  console.log('  세션 획득 완료\n');

  // 2. Supabase 연결
  console.log('[2/4] Supabase 연결...');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  console.log('  Supabase 연결 완료\n');

  // 3. 기존 코스 목록 조회
  const { data: courses, error: fetchErr } = await supabase
    .from('courses')
    .select('id, name')
    .order('name');
  if (fetchErr || !courses) {
    throw new Error(`코스 조회 실패: ${fetchErr?.message}`);
  }
  const courseByName = new Map(courses.map((c) => [c.name, c.id]));
  console.log(`  DB 코스: ${courses.length}개\n`);

  // 4. 크롤링 + 업데이트
  console.log('[3/4] 크롤링 + DB 업데이트...\n');
  const results: { name: string; roadSn: number; points: number; status: string }[] = [];
  const roadSns = Object.keys(ROAD_COURSE_MAP).map(Number).sort((a, b) => a - b);

  for (const roadSn of roadSns) {
    const courseName = ROAD_COURSE_MAP[roadSn];
    const courseId = courseByName.get(courseName);

    if (!courseId) {
      console.log(`  [${roadSn}] ${courseName} → DB에 없음, 스킵`);
      results.push({ name: courseName, roadSn, points: 0, status: 'NOT_IN_DB' });
      continue;
    }

    try {
      const points = await getLineList(roadSn, cookies);
      if (points.length === 0) {
        console.log(`  [${roadSn}] ${courseName} → 좌표 없음`);
        results.push({ name: courseName, roadSn, points: 0, status: 'NO_DATA' });
        continue;
      }

      const geojson = toGeoJSON(points);

      const { error: updateErr } = await supabase
        .from('courses')
        .update({ route_geometry: geojson })
        .eq('id', courseId);
      if (updateErr) throw new Error(updateErr.message);

      console.log(`  [${roadSn}] ${courseName} → ${points.length}개 좌표 업데이트 완료`);
      results.push({ name: courseName, roadSn, points: points.length, status: 'OK' });
    } catch (err: any) {
      console.error(`  [${roadSn}] ${courseName} → 에러: ${err.message}`);
      results.push({ name: courseName, roadSn, points: 0, status: `ERROR: ${err.message}` });
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // 5. 리포트
  console.log('\n[4/4] 결과 리포트\n');
  console.log('='.repeat(70));
  console.log(`${'코스명'.padEnd(30)} ${'roadSn'.padStart(6)} ${'좌표수'.padStart(6)} 상태`);
  console.log('-'.repeat(70));

  let successCount = 0;
  let totalPoints = 0;
  for (const r of results) {
    console.log(`${r.name.padEnd(30)} ${String(r.roadSn).padStart(6)} ${String(r.points).padStart(6)} ${r.status}`);
    if (r.status === 'OK') {
      successCount++;
      totalPoints += r.points;
    }
  }
  console.log('-'.repeat(70));
  console.log(`총 ${results.length}개 시도, ${successCount}개 성공, 총 좌표 ${totalPoints}개`);

  // DB에 매핑 안 된 코스 확인
  const updatedNames = new Set(results.filter((r) => r.status === 'OK').map((r) => r.name));
  const notUpdated = courses.filter((c) => !updatedNames.has(c.name));
  if (notUpdated.length > 0) {
    console.log(`\n매핑 안 된 DB 코스 (기존 데이터 유지):`);
    for (const c of notUpdated) {
      console.log(`  - ${c.name}`);
    }
  }

  console.log('\n='.repeat(70));
}

main().catch(console.error);
