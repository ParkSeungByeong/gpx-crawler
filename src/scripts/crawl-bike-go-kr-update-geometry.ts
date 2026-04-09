/**
 * bike.go.kr API에서 43개 자전거길 상세 좌표를 크롤링하여
 * Supabase courses 테이블의 route_geometry에 업데이트하는 스크립트
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// bike.go.kr API
const API_BASE = 'https://www.bike.go.kr/map';
const REFERER_BASE = 'https://www.bike.go.kr/map/roadMap.do';

interface LinePoint {
  lineXp: string; // latitude
  lineYp: string; // longitude
  lineOrdr: string;
  lineSn: string;
  roadSn: string;
}

interface ApiResponse {
  roadHeadList?: string[];
  roadList?: LinePoint[];
}

// roadSn -> route name mapping (bike.go.kr 기준)
const ROAD_MAP: Record<number, { name: string; type: number }> = {
  // Type 1: 국토종주 자전거길
  1:  { name: '아라자전거길', type: 1 },
  2:  { name: '한강종주자전거길(서울구간)', type: 1 },
  3:  { name: '남한강자전거길', type: 1 },
  4:  { name: '새재자전거길', type: 1 },
  5:  { name: '낙동강자전거길', type: 1 },
  6:  { name: '금강자전거길', type: 1 },
  7:  { name: '영산강자전거길', type: 1 },
  8:  { name: '북한강(경춘선)자전거길', type: 1 },
  9:  { name: '섬진강자전거길', type: 1 },
  10: { name: '오천자전거길', type: 1 },
  11: { name: '동해안자전거길(강원)', type: 1 },
  12: { name: '동해안자전거길(경북)', type: 1 },
  13: { name: '제주환상자전거길', type: 1 },
  // Type 2: 지자체명품 자전거길
  14: { name: '강릉 경포호 산소길', type: 2 },
  15: { name: '화천 파로호 100리 산소길', type: 2 },
  16: { name: '옹진 덕적도 자전거길', type: 2 },
  18: { name: '옥천 향수 100리길', type: 2 },
  19: { name: '정읍 정읍천 자전거길', type: 2 },
  20: { name: '신안 증도 자전거섬', type: 2 },
  21: { name: '경주 역사탐방 자전거길', type: 2 },
  23: { name: '제주 해맞이 해안로', type: 2 },
  // Type 3: 바다를 품은 섬 자전거길
  24: { name: '강화 갯벌 자전거길', type: 3 },
  25: { name: '영흥도 십리포 자전거길', type: 3 },
  26: { name: '군산 선유도 자전거길', type: 3 },
  27: { name: '여수 거문도 자전거길', type: 3 },
  28: { name: '고흥 자전거길', type: 3 },
  29: { name: '완도 수목원 자전거길', type: 3 },
  30: { name: '완도 청산도 자전거길', type: 3 },
  31: { name: '완도 생일도 자전거길', type: 3 },
  32: { name: '진도 자전거길', type: 3 },
  33: { name: '신안 자은도 자전거길', type: 3 },
  34: { name: '신안 임자도 자전거길', type: 3 },
  35: { name: '신안 증도 자전거길', type: 3 },
  36: { name: '보령 원산도 자전거길', type: 3 },
  39: { name: '덕적도 갈맷길 자전거길', type: 3 },
  41: { name: '울릉도 자전거길', type: 3 },
  42: { name: '사천 신수도 자전거길', type: 3 },
  43: { name: '남해 자전거길', type: 3 },
  44: { name: '거제 자전거길', type: 3 },
  45: { name: '제주 우도 자전거길', type: 3 },
  46: { name: '제주 가파도 자전거길', type: 3 },
};

// DB의 course name -> bike.go.kr roadSn 매핑 (이름이 다른 경우)
const NAME_ALIASES: Record<string, string> = {
  '북한강자전거길': '북한강(경춘선)자전거길',
  '대구 팔공산 자전거길': '', // bike.go.kr에 없을 수 있음
  '상주 낙동강 자전거길': '', // bike.go.kr에 없을 수 있음
  '합천 황강 자전거길': '', // bike.go.kr에 없을 수 있음
  '안산 대부도 자전거길': '', // bike.go.kr에 없을 수 있음
  '태안 안면도 자전거길': '', // bike.go.kr에 없을 수 있음
  '통영 한산도 자전거길': '', // bike.go.kr에 없을 수 있음
  '포항 구룡포 자전거길': '', // bike.go.kr에 없을 수 있음
};

async function fetchRouteCoordinates(roadSn: number, roadType: number): Promise<[number, number][] | null> {
  const referer = `${REFERER_BASE}?roadSn=${roadSn}&roadType=${roadType}&key=2008148358544&xp=37.5&yp=127.0&zm=7`;

  try {
    const response = await fetch(`${API_BASE}/getLineList.do?key=2008148358544`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: `roadSn=${roadSn}`,
    });

    if (!response.ok) {
      console.error(`  [HTTP ${response.status}] roadSn=${roadSn}`);
      return null;
    }

    const data: ApiResponse[] = await response.json();

    if (!data || !data[0] || !data[0].roadList || data[0].roadList.length === 0) {
      console.error(`  [EMPTY] roadSn=${roadSn} - 좌표 데이터 없음`);
      return null;
    }

    const points = data[0].roadList;

    // lineOrdr 기준으로 세그먼트별 정렬, 각 세그먼트 내에서 lineSn 순 정렬
    points.sort((a, b) => {
      const ordrDiff = parseInt(a.lineOrdr) - parseInt(b.lineOrdr);
      if (ordrDiff !== 0) return ordrDiff;
      return parseInt(a.lineSn) - parseInt(b.lineSn);
    });

    // [lng, lat] GeoJSON 좌표 배열 (EPSG:4326)
    const coordinates: [number, number][] = points.map(p => [
      parseFloat(p.lineYp), // longitude
      parseFloat(p.lineXp), // latitude
    ]);

    return coordinates;
  } catch (err) {
    console.error(`  [ERROR] roadSn=${roadSn}:`, (err as Error).message);
    return null;
  }
}

function findBestMatch(bikeGoKrName: string, dbCourses: { id: string; name: string }[]): { id: string; name: string } | null {
  // Exact match
  const exact = dbCourses.find(c => c.name === bikeGoKrName);
  if (exact) return exact;

  // Partial match (contains)
  const partial = dbCourses.find(c =>
    c.name.includes(bikeGoKrName) || bikeGoKrName.includes(c.name)
  );
  if (partial) return partial;

  // Fuzzy: remove spaces and compare
  const normalize = (s: string) => s.replace(/\s+/g, '').replace(/[()（）]/g, '');
  const normName = normalize(bikeGoKrName);
  const fuzzy = dbCourses.find(c => {
    const normDb = normalize(c.name);
    return normDb.includes(normName) || normName.includes(normDb);
  });
  if (fuzzy) return fuzzy;

  return null;
}

interface UpdateResult {
  roadSn: number;
  bikeGoKrName: string;
  dbName: string | null;
  dbId: string | null;
  pointCount: number;
  status: 'updated' | 'no_match' | 'fetch_failed' | 'update_failed';
  error?: string;
}

async function main() {
  console.log('===========================================');
  console.log('  bike.go.kr → Supabase route_geometry 업데이트');
  console.log('===========================================\n');

  // 1. DB에서 모든 courses 가져오기
  const { data: dbCourses, error: dbError } = await supabase
    .from('courses')
    .select('id, name')
    .order('name');

  if (dbError || !dbCourses) {
    console.error('DB 조회 실패:', dbError);
    process.exit(1);
  }

  console.log(`DB에 ${dbCourses.length}개 코스 존재\n`);

  const results: UpdateResult[] = [];
  const roadSnList = Object.keys(ROAD_MAP).map(Number).sort((a, b) => a - b);

  console.log(`bike.go.kr에서 ${roadSnList.length}개 노선 크롤링 시작...\n`);

  // 2. 각 노선별 좌표 크롤링 + DB 업데이트
  for (const roadSn of roadSnList) {
    const { name: bikeGoKrName, type: roadType } = ROAD_MAP[roadSn];
    process.stdout.write(`[${roadSn}/${roadSnList[roadSnList.length - 1]}] ${bikeGoKrName}... `);

    // 좌표 크롤링
    const coordinates = await fetchRouteCoordinates(roadSn, roadType);

    if (!coordinates) {
      console.log('❌ 크롤링 실패');
      results.push({
        roadSn, bikeGoKrName, dbName: null, dbId: null,
        pointCount: 0, status: 'fetch_failed',
      });
      continue;
    }

    // DB 매칭
    const match = findBestMatch(bikeGoKrName, dbCourses);

    if (!match) {
      console.log(`⚠️  DB 매칭 없음 (${coordinates.length} points)`);
      results.push({
        roadSn, bikeGoKrName, dbName: null, dbId: null,
        pointCount: coordinates.length, status: 'no_match',
      });
      continue;
    }

    // route_geometry 업데이트 (GeoJSON LineString)
    const geojson = {
      type: 'LineString',
      crs: { type: 'name', properties: { name: 'EPSG:4326' } },
      coordinates,
    };

    const { error: updateError } = await supabase
      .from('courses')
      .update({ route_geometry: geojson, updated_at: new Date().toISOString() })
      .eq('id', match.id);

    if (updateError) {
      console.log(`❌ DB 업데이트 실패: ${updateError.message}`);
      results.push({
        roadSn, bikeGoKrName, dbName: match.name, dbId: match.id,
        pointCount: coordinates.length, status: 'update_failed',
        error: updateError.message,
      });
      continue;
    }

    console.log(`✅ ${coordinates.length} points → ${match.name}`);
    results.push({
      roadSn, bikeGoKrName, dbName: match.name, dbId: match.id,
      pointCount: coordinates.length, status: 'updated',
    });

    // API rate limit 방지
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. 결과 리포트
  console.log('\n===========================================');
  console.log('  결과 리포트');
  console.log('===========================================\n');

  const updated = results.filter(r => r.status === 'updated');
  const noMatch = results.filter(r => r.status === 'no_match');
  const fetchFailed = results.filter(r => r.status === 'fetch_failed');
  const updateFailed = results.filter(r => r.status === 'update_failed');
  const totalPoints = updated.reduce((sum, r) => sum + r.pointCount, 0);

  console.log(`총 크롤링 시도: ${results.length}개 노선`);
  console.log(`✅ 업데이트 성공: ${updated.length}개`);
  console.log(`⚠️  DB 매칭 실패: ${noMatch.length}개`);
  console.log(`❌ 크롤링 실패: ${fetchFailed.length}개`);
  console.log(`❌ DB 업데이트 실패: ${updateFailed.length}개`);
  console.log(`📍 총 좌표 수: ${totalPoints.toLocaleString()}개`);

  if (updated.length > 0) {
    console.log('\n--- 업데이트 성공 목록 ---');
    updated.forEach(r => {
      console.log(`  [roadSn=${r.roadSn}] ${r.dbName} → ${r.pointCount.toLocaleString()} points`);
    });
  }

  if (noMatch.length > 0) {
    console.log('\n--- DB 매칭 실패 목록 ---');
    noMatch.forEach(r => {
      console.log(`  [roadSn=${r.roadSn}] ${r.bikeGoKrName} (${r.pointCount} points)`);
    });
  }

  if (fetchFailed.length > 0) {
    console.log('\n--- 크롤링 실패 목록 ---');
    fetchFailed.forEach(r => {
      console.log(`  [roadSn=${r.roadSn}] ${r.bikeGoKrName}`);
    });
  }

  if (updateFailed.length > 0) {
    console.log('\n--- DB 업데이트 실패 목록 ---');
    updateFailed.forEach(r => {
      console.log(`  [roadSn=${r.roadSn}] ${r.dbName}: ${r.error}`);
    });
  }

  // DB에 있지만 bike.go.kr에 없는 코스
  const updatedDbNames = new Set(updated.map(r => r.dbName));
  const unmatchedDb = dbCourses.filter(c => !updatedDbNames.has(c.name));
  if (unmatchedDb.length > 0) {
    console.log(`\n--- bike.go.kr에 없는 DB 코스 (${unmatchedDb.length}개) ---`);
    unmatchedDb.forEach(c => console.log(`  ${c.name}`));
  }

  // JSON 리포트 저장
  const report = {
    crawledAt: new Date().toISOString(),
    summary: {
      totalAttempted: results.length,
      updated: updated.length,
      noMatch: noMatch.length,
      fetchFailed: fetchFailed.length,
      updateFailed: updateFailed.length,
      totalCoordinates: totalPoints,
    },
    details: results,
  };

  const fs = await import('fs');
  const path = await import('path');
  const reportPath = path.resolve(__dirname, '../../data/crawl-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📄 리포트 저장: ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
