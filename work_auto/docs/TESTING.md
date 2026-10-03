# TESTING — 자동 테스트

코드를 바꾼 뒤 "예전에 되던 기능이 그대로 되는지"를 사람이 화면을 눌러 보지 않고 확인한다.

## 1. 명령어

| 명령 | 무엇을 | 시간 | 필요한 것 |
|------|--------|------|-----------|
| `npm test` | 기능 규칙(unit) + DB 권한(PGlite) | 몇 초 | 없음 (서버·인터넷·키 불필요) |
| `npm run test:api` | 실행 중인 서버에 실제 요청 (생성·업로드·트렌드·스타일·오류 기록 흐름) | 10초 안팎 | 데모 모드 서버 |

`npm run test:api` 준비:

```bash
npm run build
npx next start -p 3000        # 다른 터미널. .env.local 의 Supabase 값이 없어야 데모 모드
npm run test:api              # 다른 주소는 API_BASE_URL=http://127.0.0.1:4000 npm run test:api
```

- 서버가 꺼져 있으면 API 테스트는 실패하지 않고 **건너뛴다**
- 데모 데이터가 쌓이므로 서버를 새로 띄운 직후에 돌린다 (1분 호출 한도에 걸리지 않게)
- `BASE_URL` 은 Vitest 가 미리 쓰는 이름이라 `API_BASE_URL` 을 쓴다

## 2. 무엇을 확인하나

| 파일 | 내용 |
|------|------|
| `tests/unit/style-and-lists.test.ts` | 나의 스타일 표본(10개)·규칙/금지 전부·블로그 재해석 지시, 계절, 시즌 키워드 순서, 관련 검색어 정렬, 아이디어 30개 중복 없음, 업로드 날짜(한국 시간), CSV 수식 주입 방지 |
| `tests/unit/server-rules.test.ts` | SSRF(내부 주소 거부), 스타일 파일 검사(TXT/CSV/바이너리), 오류 기록 비밀값 가림, 학습 프로필 정리 규칙(중복·근거·10개 제한·짧은 요약), YouTube 업로드 판별 |
| `tests/db/schema.test.ts` | `supabase/schema.sql` 을 내장 Postgres 에서 **두 번** 실행(재실행 안전) + RLS: 본인 데이터만, 등급 셀프 변경 불가, 업로드 팀 공용·수정/삭제 권한, 학습 프로필 삭제는 관리자, 오류 기록 권한 |
| `tests/api/flows.test.ts` | 생성 결과 구성(제목·Hook·CTA 10개, 블로그 `##` 없음) → 다시 만들기(다른 칸 유지) → 직접 수정·후보 선택 → 피드백 → 학습 대기 수, 업로드 등록·상태 배지·YouTube 1·7일 성과 저장, 입력 검사, NAVER [더보기] 중복 없음, 스타일 CSV 300개, 오류 기록 |

DB 테스트는 Supabase 의 `auth` 스키마·`auth.uid()`·역할(anon/authenticated)을 흉내 낸다. 실제 Supabase 와 100% 같지는 않지만 정책 문법·권한 실수는 잡는다
(예: v0.9.21 에서 "직원이 오류를 기록하면 저장 직후 결과를 못 돌려받아 실패" 버그를 찾음).

## 3. 언제 돌리나

- 완료 전: `npm run lint && npm run typecheck && npm test && npm run build`
- 생성·업로드·트렌드 API 를 바꿨으면 `npm run test:api` 도
- `schema.sql` 을 바꿨으면 `npm test` 의 DB 테스트에 새 정책 확인을 추가한다

## 4. 테스트를 추가할 때

- 순수 함수 → `tests/unit` (서버 전용 모듈도 import 가능: `server-only` 는 빈 모듈로 바꿔 둠, `vitest.config.mts`)
- 테이블·RLS → `tests/db/schema.test.ts` 에서 `as(사용자)` 로 역할을 바꿔 `q(sql)`
- API 흐름 → `tests/api` (실제 AI 대신 데모 Provider 응답)
- 실제 AI·YouTube·NAVER 키로 하는 확인은 자동 테스트에 넣지 않는다 (비용·할당량·결과가 매번 다름)
