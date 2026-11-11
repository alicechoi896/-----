---
name: safety-rules
description: work_auto(자동화 지니)에서 코드를 고치거나 기능을 만들 때 항상 지키는 안전 규칙 — DB(Supabase) 변경 금지 사항, API 키·비밀, 유료 API(Kie·TikHub·OpenAI·Bright Data) 호출 규칙, 공개 저장소 주의. DB·SQL·마이그레이션, 유료 호출, 키, 커밋할 파일을 다룰 때 반드시 먼저 읽는다.
---

# 안전 규칙 (모든 작업)

## DB (Supabase)
- **금지**: table 삭제 · column 삭제 · rename · type 변경 · 기존 데이터 이동 · RLS 임의 변경.
- DB 변경이 정말 필요하면 **바로 실행하지 않는다** → 이유와 SQL 을 먼저 보여 주고 사용자가 실행한다. SQL 은 직접 실행하지 않는다.
- 새 데이터는 되도록 저장소 JSON 으로: `videoStorage.put/download` 로 `{owner}/...` 경로 (예: `{owner}/stay/projects.json`). DB 스키마를 건드리지 않는다.
- SQL 을 만들어 줄 때: ① 확인용 select ② 실행문, 예전 값은 지우지 않고 합친다. 가능하면 PGlite(임시 Postgres)로 먼저 돌려 본다 (`tests/db/schema.test.ts` 방식).

## 키·비밀
- API 키(TikHub·Bright Data·OpenAI·Kie·Claude 등)를 코드에 쓰지 않고, 로그·응답·화면에 내보내지 않는다.
- `.env` 파일은 읽지 않는다. Vercel 환경변수는 사용자가 직접 넣는다 (비밀번호를 대화에 붙여 넣지 않게 안내).
- 서버가 사용자 주소로 접속할 때는 `safeFetch()` (SSRF 방지), 서버 IP 로 외부를 부르면 `rateLimit()`.

## 유료 API
- **1클릭 = 1호출**. 확인 창(`confirmed: true`)을 거친 뒤에만. 자동 재시도 없음. `useEffect`·조건 변경으로 부르지 않는다.
- **TikHub 최소화** ("tikhub를 한번 더 걸치지마. 돈들어"): 무료 공식 API 먼저, TikHub 는 사용자가 누를 때만. 자동 실행(크론) 중에는 유료 대체 경로를 쓰지 않는다 (`noPaidFallback`).
- 새 유료 경로는 1개로 먼저 시험한다. 확인 창에 예상 비용($)을 보여 준다.
- 컷·이미지 '다시 만들기'는 **고른 것만** 만든다 (다른 실패 항목까지 같이 만들면 과금이 늘어남).
- 상태 확인(Kie status 등)은 무료라 자동 확인 가능, 만들기(createTask)는 아님.

## 공개 저장소 (GitHub public 모노레포)
- 커밋은 work_auto 만: `C:/Users/choi/클로드코드` 에서 `git commit ... -- work_auto`.
- **절대 커밋 금지**: `assets/video`, `*.mp4`, `reference/`, `ref/` (사용자 참고 자료). 매뉴얼 캡처에 사용자 참고 영상·사진이 나오지 않게 (시험 패턴 이미지로).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 가전
- "절대절대 가전쪽에 문제가 생기면 안됨" — 숙소·패션·생활 등 다른 분류 기능을 고칠 때 가전 영상·원고 동작이 바뀌지 않게 조건(`plan.stay`, 분류)으로 가둔다.

## 말하기
- 사용자에게는 모든 답·중간 안내·보고를 **한국어**로.
