import * as fs from 'fs';
import * as path from 'path';
import type { Crawler, CrawlResult } from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');
const API_KEY = '2008148358544';
const API_URL = 'https://www.bike.go.kr/map/getLineList.do';

/** 국토종주 자전거길 (roadSn 1~13) */
const NATIONAL_ROUTES: { roadSn: number; name: string }[] = [
  { roadSn: 1, name: '아라자전거길' },
  { roadSn: 2, name: '한강종주자전거길(서울구간)' },
  { roadSn: 3, name: '남한강자전거길' },
  { roadSn: 4, name: '북한강(경춘선)자전거길' },
  { roadSn: 5, name: '새재자전거길' },
  { roadSn: 6, name: '낙동강자전거길' },
  { roadSn: 7, name: '금강자전거길' },
  { roadSn: 8, name: '영산강자전거길' },
  { roadSn: 9, name: '섬진강자전거길' },
  { roadSn: 10, name: '오천자전거길' },
  { roadSn: 11, name: '동해안자전거길(강원)' },
  { roadSn: 12, name: '동해안자전거길(경북)' },
  { roadSn: 13, name: '제주환상자전거길' },
];

/** 지자체 명품 자전거길 (roadSn 14~23) */
const LOCAL_ROUTES: { roadSn: number; name: string }[] = [
  { roadSn: 14, name: '강릉 경포호 산소길' },
  { roadSn: 15, name: '화천 파로호 100리 산소길' },
  { roadSn: 16, name: '옹진 덕적도 자전거길' },
  { roadSn: 17, name: '옥천 향수 100리길' },
  { roadSn: 18, name: '정읍 정읍천 자전거길' },
  { roadSn: 19, name: '신안 증도 자전거섬' },
  { roadSn: 20, name: '경주 역사탐방 자전거길' },
  { roadSn: 21, name: '합천 황강 자전거길' },
  { roadSn: 22, name: '상주 낙동강 자전거길' },
  { roadSn: 23, name: '대구 팔공산 자전거길' },
];

/** 섬 자전거길 (roadSn 24~46) */
const ISLAND_ROUTES: { roadSn: number; name: string }[] = [
  { roadSn: 24, name: '강화 갯벌 자전거길' },
  { roadSn: 25, name: '덕적도 갈맷길 자전거길' },
  { roadSn: 26, name: '영흥도 십리포 자전거길' },
  { roadSn: 27, name: '안산 대부도 자전거길' },
  { roadSn: 28, name: '태안 안면도 자전거길' },
  { roadSn: 29, name: '보령 원산도 자전거길' },
  { roadSn: 30, name: '군산 선유도 자전거길' },
  { roadSn: 31, name: '신안 자은도 자전거길' },
  { roadSn: 32, name: '신안 증도 자전거길' },
  { roadSn: 33, name: '신안 임자도 자전거길' },
  { roadSn: 34, name: '진도 자전거길' },
  { roadSn: 35, name: '완도 청산도 자전거길' },
  { roadSn: 36, name: '여수 거문도 자전거길' },
  { roadSn: 39, name: '남해 자전거길' },
  { roadSn: 41, name: '거제 자전거길' },
  { roadSn: 42, name: '통영 한산도 자전거길' },
  { roadSn: 43, name: '포항 구룡포 자전거길' },
  { roadSn: 44, name: '울릉도 자전거길' },
  { roadSn: 45, name: '제주 우도 자전거길' },
  { roadSn: 46, name: '제주 가파도 자전거길' },
];

const ALL_ROUTES = [...NATIONAL_ROUTES, ...LOCAL_ROUTES, ...ISLAND_ROUTES];

interface LinePoint {
  lineXp: string; // latitude
  lineYp: string; // longitude
  lineOrdr: string;
  lineSn: number;
}

/**
 * 자전거행복나눔 (bike.go.kr) 크롤러
 * 내부 API를 통해 자전거길 좌표 데이터를 수집하여 GPX로 변환
 */
export class BikeGoKrCrawler implements Crawler {
  source = 'bike-go-kr' as const;

  async crawl(): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    fs.mkdirSync(DATA_DIR, { recursive: true });

    for (const route of ALL_ROUTES) {
      try {
        const points = await this.fetchRoutePoints(route.roadSn);
        if (points.length === 0) {
          console.warn(`[bike.go.kr] 포인트 없음: ${route.name} (roadSn=${route.roadSn})`);
          continue;
        }

        const gpxContent = this.buildGpx(route.name, points);
        const fileName = `bike-go-kr_${sanitizeFileName(route.name)}.gpx`;
        const filePath = path.join(DATA_DIR, fileName);
        fs.writeFileSync(filePath, gpxContent, 'utf-8');

        results.push({
          source: this.source,
          filePath,
          originalUrl: `https://www.bike.go.kr/map/roadMap.do?roadSn=${route.roadSn}`,
          name: route.name,
          crawledAt: new Date().toISOString(),
        });
        console.log(`[bike.go.kr] 다운로드 완료: ${route.name} (${points.length}포인트)`);

        // Rate limiting
        await delay(500);
      } catch (err) {
        console.error(`[bike.go.kr] 실패: ${route.name}`, err);
      }
    }

    console.log(`[bike.go.kr] 총 ${results.length}개 GPX 수집 완료`);
    return results;
  }

  private async fetchRoutePoints(roadSn: number): Promise<LinePoint[]> {
    const response = await fetch(
      `${API_URL}?key=${API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bike.go.kr/map/roadMap.do',
        },
        body: `roadSn=${roadSn}`,
      }
    );

    const data: any = await response.json();
    return data?.[0]?.roadList || [];
  }

  private buildGpx(name: string, points: LinePoint[]): string {
    const trkpts = points
      .map((p) => {
        const lat = p.lineXp.trim();
        const lon = p.lineYp.trim();
        return `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="bike.go.kr crawler"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <desc>자전거행복나눔 - ${escapeXml(name)}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').substring(0, 50);
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
