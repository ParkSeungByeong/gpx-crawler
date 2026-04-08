import * as fs from 'fs';
import GpxParser from 'gpxparser';
import type { CrawlResult, ParsedCourse, TrackPoint } from '../types';

/**
 * GPX 파일을 파싱하여 구조화된 코스 데이터로 변환
 */
export function parseGpxFile(crawlResult: CrawlResult): ParsedCourse | null {
  try {
    const gpxContent = fs.readFileSync(crawlResult.filePath, 'utf-8');
    return parseGpxString(gpxContent, crawlResult);
  } catch (err) {
    console.error(`[parser] 파일 읽기 실패: ${crawlResult.filePath}`, err);
    return null;
  }
}

/**
 * GPX 문자열을 파싱
 */
export function parseGpxString(
  gpxContent: string,
  meta: Pick<CrawlResult, 'source' | 'originalUrl' | 'name'>
): ParsedCourse | null {
  try {
    const gpx = new GpxParser();
    gpx.parse(gpxContent);

    const trackPoints: TrackPoint[] = [];

    // 모든 트랙의 포인트 수집
    for (const track of gpx.tracks) {
      for (const point of track.points) {
        trackPoints.push({
          lat: point.lat,
          lon: point.lon,
          ele: point.ele ?? undefined,
          time: point.time ? new Date(point.time).toISOString() : undefined,
        });
      }
    }

    // 웨이포인트도 포함 (트랙이 없는 경우)
    if (trackPoints.length === 0) {
      for (const wp of gpx.waypoints) {
        trackPoints.push({
          lat: wp.lat,
          lon: wp.lon,
          ele: wp.ele ?? undefined,
        });
      }
    }

    if (trackPoints.length === 0) {
      console.warn(`[parser] 트랙포인트 없음: ${meta.name}`);
      return null;
    }

    // 거리 계산 (km)
    const distance = calculateTotalDistance(trackPoints);

    // 고도 통계 계산
    const elevationStats = calculateElevationStats(trackPoints);

    const courseName =
      gpx.metadata?.name || gpx.tracks[0]?.name || meta.name;

    return {
      name: courseName,
      description: gpx.metadata?.desc || gpx.tracks[0]?.desc || undefined,
      source: meta.source,
      sourceUrl: meta.originalUrl,
      trackPoints,
      distance,
      ...elevationStats,
      difficulty: estimateDifficulty(distance, elevationStats.elevationGain),
    };
  } catch (err) {
    console.error(`[parser] GPX 파싱 실패: ${meta.name}`, err);
    return null;
  }
}

/**
 * 파싱된 GPX 파일 목록 일괄 처리
 */
export function parseAll(crawlResults: CrawlResult[]): ParsedCourse[] {
  const parsed: ParsedCourse[] = [];

  for (const result of crawlResults) {
    const course = parseGpxFile(result);
    if (course) {
      parsed.push(course);
      console.log(
        `[parser] 파싱 완료: ${course.name} (${course.trackPoints.length}포인트, ${course.distance.toFixed(1)}km)`
      );
    }
  }

  console.log(`[parser] 총 ${parsed.length}/${crawlResults.length}개 파싱 완료`);
  return parsed;
}

/** Haversine 공식으로 두 좌표 간 거리 계산 (km) */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 전체 트랙 거리 계산 */
function calculateTotalDistance(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return total;
}

/** 고도 통계 계산 */
function calculateElevationStats(points: TrackPoint[]) {
  const elevations = points.map((p) => p.ele).filter((e): e is number => e != null);

  if (elevations.length === 0) {
    return {
      elevationGain: undefined,
      elevationLoss: undefined,
      minElevation: undefined,
      maxElevation: undefined,
    };
  }

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - elevations[i - 1];
    if (diff > 0) gain += diff;
    else loss += Math.abs(diff);
  }

  return {
    elevationGain: Math.round(gain),
    elevationLoss: Math.round(loss),
    minElevation: Math.round(Math.min(...elevations)),
    maxElevation: Math.round(Math.max(...elevations)),
  };
}

/** 난이도 추정 */
function estimateDifficulty(
  distanceKm: number,
  elevationGain?: number
): 'easy' | 'moderate' | 'hard' {
  const gain = elevationGain || 0;

  if (distanceKm < 30 && gain < 300) return 'easy';
  if (distanceKm > 100 || gain > 1500) return 'hard';
  return 'moderate';
}
