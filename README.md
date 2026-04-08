# gpx-crawler

한국 자전거길 GPX 데이터 웹 크롤러. 다양한 소스에서 자전거 코스 GPX를 수집하고 파싱하여 Supabase에 업로드합니다.

## 크롤링 소스

| 소스 | URL | 설명 |
|------|-----|------|
| 자전거행복나눔 | bike.go.kr | 공식 자전거길 GPX |
| 공공데이터포털 | data.go.kr | 자전거코스 데이터셋 |
| Strava | strava.com | 공개 세그먼트/루트 |
| Komoot | komoot.com | 공개 루트 |
| Wikiloc | wikiloc.com | 공개 루트 |

## 설치

```bash
npm install
cp .env.example .env
# .env 파일에 Supabase 키 설정
```

## 사용법

```bash
# 전체 파이프라인 (크롤링 → 파싱 → 업로드)
npm run run

# 개별 단계
npm run crawl    # GPX 파일 수집
npm run parse    # GPX 파싱
npm run upload   # Supabase 업로드
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SUPABASE_URL` | O | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | O | Supabase 서비스 롤 키 |
| `DATA_GO_KR_API_KEY` | △ | 공공데이터포털 API 키 |
| `STRAVA_ACCESS_TOKEN` | △ | Strava API 토큰 |
