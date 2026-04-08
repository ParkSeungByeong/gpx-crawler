import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { BikeGoKrCrawler } from './crawlers/bike-go-kr';
import { DataGoKrCrawler } from './crawlers/data-go-kr';
import { StravaCrawler } from './crawlers/strava';
import { KomootCrawler } from './crawlers/komoot';
import { WikilocCrawler } from './crawlers/wikiloc';
import { parseAll } from './parser/gpx-parser';
import { uploadAll } from './uploader/supabase-uploader';
import type { Crawler, CrawlResult } from './types';

const DATA_DIR = path.resolve(__dirname, '../data');
const RESULTS_FILE = path.join(DATA_DIR, 'crawl-results.json');

/** 모든 크롤러 인스턴스 */
function getAllCrawlers(): Crawler[] {
  return [
    new BikeGoKrCrawler(),
    new DataGoKrCrawler(),
    new StravaCrawler(),
    new KomootCrawler(),
    new WikilocCrawler(),
  ];
}

/** 1단계: 크롤링 - 각 소스에서 GPX 파일 수집 */
async function crawl(): Promise<CrawlResult[]> {
  console.log('=== 크롤링 시작 ===');
  const allResults: CrawlResult[] = [];
  const crawlers = getAllCrawlers();

  for (const crawler of crawlers) {
    console.log(`\n--- ${crawler.source} 크롤링 ---`);
    try {
      const results = await crawler.crawl();
      allResults.push(...results);
    } catch (err) {
      console.error(`[${crawler.source}] 크롤러 실패:`, err);
    }
  }

  // 결과 저장
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(allResults, null, 2), 'utf-8');
  console.log(`\n=== 크롤링 완료: 총 ${allResults.length}개 GPX 수집 ===`);

  return allResults;
}

/** 2단계: 파싱 - GPX 파일을 구조화된 데이터로 변환 */
async function parse() {
  console.log('=== 파싱 시작 ===');

  // 이전 크롤링 결과 로드
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error('크롤링 결과 파일이 없습니다. 먼저 crawl을 실행하세요.');
    process.exit(1);
  }

  const crawlResults: CrawlResult[] = JSON.parse(
    fs.readFileSync(RESULTS_FILE, 'utf-8')
  );

  const courses = parseAll(crawlResults);
  console.log(`=== 파싱 완료: ${courses.length}개 코스 ===`);

  return { courses, crawlResults };
}

/** 3단계: 업로드 - Supabase에 데이터 저장 */
async function upload() {
  console.log('=== 업로드 시작 ===');

  const { courses, crawlResults } = await parse();

  // GPX 파일 경로 매핑
  const gpxPaths = new Map<string, string>();
  for (const result of crawlResults) {
    const course = courses.find(
      (c) => c.sourceUrl === result.originalUrl || c.name === result.name
    );
    if (course) {
      gpxPaths.set(course.name, result.filePath);
    }
  }

  const { success, failed } = await uploadAll(courses, gpxPaths);
  console.log(`=== 업로드 완료: ${success}개 성공, ${failed}개 실패 ===`);
}

/** 전체 파이프라인: crawl → parse → upload */
async function run() {
  console.log('========================================');
  console.log('  GPX Crawler - 전체 파이프라인 시작');
  console.log('========================================\n');

  const crawlResults = await crawl();
  const courses = parseAll(crawlResults);

  const gpxPaths = new Map<string, string>();
  for (const result of crawlResults) {
    const course = courses.find(
      (c) => c.sourceUrl === result.originalUrl || c.name === result.name
    );
    if (course) {
      gpxPaths.set(course.name, result.filePath);
    }
  }

  const { success, failed } = await uploadAll(courses, gpxPaths);

  console.log('\n========================================');
  console.log(`  완료: ${courses.length}개 파싱, ${success}개 업로드 성공`);
  console.log('========================================');
}

// CLI 명령어 처리
const command = process.argv[2] || 'run';

switch (command) {
  case 'crawl':
    crawl().catch(console.error);
    break;
  case 'parse':
    parse().catch(console.error);
    break;
  case 'upload':
    upload().catch(console.error);
    break;
  case 'run':
    run().catch(console.error);
    break;
  default:
    console.log(`사용법: tsx src/index.ts [crawl|parse|upload|run]`);
    process.exit(1);
}
