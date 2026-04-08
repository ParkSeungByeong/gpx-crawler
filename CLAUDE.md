# GPX Crawler - Claude 규칙

## 절대 규칙
- 모든 변경사항은 반드시 git commit + push 포함
- .env 파일은 절대 커밋하지 않음

## 프로젝트 개요
한국 자전거길 GPX 데이터를 웹에서 자동 크롤링해서 Supabase에 업로드하는 프로젝트.

## 기술 스택
- Node.js + TypeScript
- Puppeteer (동적 페이지 크롤링)
- Cheerio (정적 HTML 파싱)
- gpxparser (GPX 파싱)
- Supabase JS Client

## 크롤링 소스
1. bike.go.kr - 자전거행복나눔
2. data.go.kr - 공공데이터포털
3. Strava - 공개 세그먼트
4. Komoot - 공개 루트
5. Wikiloc - 공개 루트

## 스크립트
- `npm run crawl` - GPX 파일 수집
- `npm run parse` - GPX 파싱
- `npm run upload` - Supabase 업로드
- `npm run run` - 전체 파이프라인

## Supabase
- ride-kr 프로젝트와 동일한 DB 사용
- courses 테이블에 업로드
