# 제품 영상 자동 제작 (v0.9.107)

YouTube › 제품 영상 자동 제작 (`/youtube/auto-video`, 기능 id `yt-auto-video`, 관리자만).

## 흐름
1. **05:00 KST** `GET /api/cron/auto-video/start` (Vercel Cron `0 20 * * *` UTC): 설정이 켜져 있으면 오늘 만들 제품 N개(1~10)를 고른다.
   - 후보: 샤오홍슈 영상 2개 이상 연결 + 최근 7일 안에 `yt-product-video` 원고를 만들지 않은 제품
   - AI 1회: 키워드 라이브러리 추이(up·new)·연결 영상 수를 보고 고름 + 제품별 주요 키워드 (실패하면 추이 순)
2. **05:05~07:55 KST, 5분마다** `GET /api/cron/auto-video/tick` (`5-55/5 20-22 * * *`): 진행 중이 없으면 다음 1개를 이 함수 안에서 끝낸다 (maxDuration 800, 14분 넘게 멈추면 실패로 넘김).
   - 원고 1단계(Keyword Intelligence·제목/Hook/CTA 후보) → AI 가 제목(title_top 중)·Hook·CTA 고름 → 원고 2단계(대본 3편·설명·키워드·태그, 대본 포맷 그대로) → AI 가 대본 고름
   - 컷 계획: 가장 최근에 직접 만든 영상의 목소리·말투·속도·자막·제목 스타일, 주목 컷마다 GIPHY 스티커(연결 시)
   - 렌더 (videoJobService.create + run). 결과: 영상·업로드 제목·설명·키워드·태그
3. 보고 화면: 날짜별 결과, 복사 버튼, [업로드 관리에 예약] (`publicationService.create`, YouTube·scheduled, 설명·태그는 메모), [지금 시험 실행]

## 권한 (중요)
- 크론은 로그인한 사람이 없다 → `runAsAutomation()` 이 **자동화 계정**(Vercel 환경변수 `AUTOMATION_EMAIL`·`AUTOMATION_PASSWORD`)으로 anon key 로그인한 Supabase 클라이언트를 AsyncLocalStorage 로 그 실행 흐름에만 넣는다. `createSupabaseServerClient()` 가 이 클라이언트를 돌려줘 세션·RLS·관리자 공용 데이터가 평소와 같다. **service_role 은 쓰지 않는다.**
- 자동화 계정은 관리자여야 한다 (관리자 공용 데이터 = 모든 관리자가 결과를 본다)
- 크론 호출은 `Authorization: Bearer CRON_SECRET` 만 받는다 (Vercel 이 자동으로 붙임)

## 비용·원칙
- 영상 1개: AI 글 약 4~5회 + TTS 1편 + (처음 쓰는 영상) 글자 확인 Vision. YouTube 검색 API 는 무료 한도
- 샤오홍슈: 무료 경로만. 자동 실행 중(`noPaidFallback`)에는 TikHub 대체 경로로 넘어가지 않고 그 영상을 건너뛴다
- 자동 재시도 없음 (실패 항목은 실패로 남기고 다음으로)

## 저장 (DB 변경 없음)
Storage `videos`: `{owner}/auto/settings.json`, `{owner}/auto/runs/{YYYY-MM-DD}.json` (owner = 관리자 공용 주인)

## 환경변수 (Vercel Production)
- `AUTOMATION_EMAIL`, `AUTOMATION_PASSWORD` — 자동화 계정
- `CRON_SECRET` — 크론 인증 (긴 임의 문자열)
