# 관리자 공용 데이터 (v0.9.68)

관리자(role = admin)는 **공용 주인 계정**의 데이터를 함께 읽고 쓴다. 직원(silver·gold·vip)은 지금처럼 본인 데이터만.

## 무엇이 공유되나
`getCurrentUserId()` (lib/server/repositories/index.ts) 를 쓰는 모든 서비스 데이터:
API 연결(키), 제품·수집·분석, 생성 기록, 나의 스타일, 피드백, 성과, 참고 영상, 설정(기본 AI), 저장한 조건, 트렌드 스크랩, 콘텐츠 프로필, 대본 포맷, 키워드 관리, 영상 작업.
- 실제 로그인한 사람이 필요한 곳(감사 기록·내 정보·탈퇴·업로드 담당자·영상 동시 1개 제한)은 `getActorId()` / `session.user.id`
- 영상 '동시 1개'는 사람마다 (`qa.createdBy`)

## DB (schema.sql v0.9.68, 추가만)
- `workspace_settings` (key, value) — 관리자만 읽기·쓰기
- `shared_owner_id()` — 공용 주인 uuid (없으면 null → 각자)
- 테이블 16개에 정책 `admin_shared` 추가: `is_admin() and user_id = shared_owner_id()` (기존 `own_rows` 그대로)
- 공용 주인 지정은 SQL Editor 에서 (이메일을 저장소에 넣지 않는다)

## 동작
- 서버가 `shared_owner_id()` 를 1분 기억. 함수·표가 없거나 비어 있으면 각자 데이터 (SQL 실행 전과 같음)
- 공용을 끄려면: `delete from public.workspace_settings where key = 'shared_owner_id';` → 각자 데이터가 다시 보인다 (지운 것 없음)
- API 사용료는 공용 주인 계정의 키로 나간다. Instagram 해시태그 주 30개 한도도 함께 쓴다
