# UPLOADS — 콘텐츠 업로드 관리

> v0.9.16 (2026-10-03). 메뉴: 관리 › 업로드 관리 (`/uploads`)

직원이 **어느 날짜에, 어느 채널에, 어떤 제품의, 어떤 콘텐츠를** 올렸는지 기록하고, 팀 전체가 월별 캘린더로 업로드 현황을 본다.

## 1. 왜 별도 테이블인가

`generated_contents` 는 "생성물"이고, 업로드는 별개의 사건이다.

> 콘텐츠 1개 생성 → YouTube 업로드 + NAVER 클립 업로드 = **업로드 기록 2개**

`generated_contents.uploaded boolean` 으로는 아래를 담을 수 없다.

- 한 콘텐츠를 여러 플랫폼·여러 날짜에 올림 (재업로드 포함)
- 예약일과 실제 업로드일이 다름, 업로드 URL, 담당자
- 생성 시스템 밖에서 만든 콘텐츠 (직접 등록)
- `performance_metrics` 는 성과 수치용이고 `content_id` 가 필수라 직접 등록을 담지 못한다
- `generated_contents`·`products` 는 본인 행만 보이는 RLS 라 팀 캘린더에서 남의 제목·제품명을 읽을 수 없다 → 업로드 기록에 **제목·제품명을 복사해 둔다**

그래서 `content_publications` 를 새로 만들었다 (추가만, 기존 테이블·컬럼·RLS 변경 없음).
이렇게 나누면 "이번 달 재호가 48개 만들고 42개 업로드, 6개 예약" 같은 통계도 자연스럽게 만들 수 있다.

## 2. 데이터 (content_publications)

| 필드 | 설명 |
|---|---|
| user_id | 등록한 사람 |
| content_id | 생성 콘텐츠 (직접 등록이면 null). 콘텐츠를 지우면 연결만 풀린다 |
| product_id / product_name | 제품 연결과 제품명 복사본 |
| platform | `youtube` `naver-clip` `naver-blog` `other` … DB 제한 없음, 목록은 `lib/publish-platforms.ts` (Instagram 등은 한 줄 추가) |
| account_name | 채널·계정 |
| title / content_type | 콘텐츠 제목, 원고 유형 (기존 콘텐츠를 고르면 자동) |
| status | `draft`(준비 중) `scheduled`(예약) `published`(업로드 완료) `failed`(실패) |
| scheduled_at / published_at | 예약일 / 실제 업로드일. 업로드 완료인데 날짜가 없으면 저장 시각 |
| platform_url | 업로드 주소 (http(s)만) |
| assignee_id / assignee_name | 담당자 (이름 복사본) |
| note | 메모 |

캘린더 날짜 = 실제 업로드일 → 예약일 → 등록일 (한국 시간).

## 3. 권한 (RLS + 서비스)

| | 조회 | 등록 | 수정 | 삭제 |
|---|---|---|---|---|
| 승인된 직원 | **팀 전체** | 본인 이름으로 | 내가 등록했거나 담당자인 것 | 내가 등록한 것 |
| 관리자 | 전체 | O | 전체 | 전체 |
| 승인 대기 | X | X | X | X |

- 담당자: 관리자는 승인된 직원 중에서 고르고, 직원이 등록하면 본인
- 기존 콘텐츠 연결은 **내가 만든 콘텐츠·제품만** (서비스에서 확인)
- 등록·수정·삭제는 활동 기록(audit_logs)에 남는다: `publication.create/update/delete`

## 4. 업로드 상태 (생성 콘텐츠 배지)

`generated_contents` 에 따로 저장하지 않고 업로드 기록에서 계산한다 (Source of Truth = content_publications).

| 업로드 기록 | 배지 |
|---|---|
| 없음 (또는 준비 중·실패만) | 미업로드 |
| 예약 있음 | 예약 |
| 업로드 완료 있음 | 업로드 완료 |

표시 위치: 생성 결과 상단, 생성 화면의 최근 생성 이력, AI 학습 관리 › 콘텐츠 히스토리 (`GET /api/publications/status?ids=`).

## 5. 화면

- **월간 캘린더**: `< 2026년 10월 >` [오늘], 필터(플랫폼·제품·상태·담당자), 이번 달 업로드·예약 수, 담당자별 현황
  - 날짜 칸: `YouTube · 제품명` 3개까지, 넘치면 `+N개 더보기`. 예약은 흐리게 "(예약)"
- **날짜를 누르면** 오른쪽 패널: 총 N개, 플랫폼·제품·제목·담당자·상태·[영상 보기/글 보기]·수정·삭제, [이 날짜로 업로드 등록]
- **[+ 업로드 등록]**: [기존 콘텐츠 선택](검색 → 제품·제목·원고 유형·플랫폼 자동) / [직접 등록]
- **생성 결과 화면 [업로드 등록]** → `/uploads?contentId=…` 로 그 콘텐츠가 선택된 등록 창

## 5-1. YouTube 성과 자동 수집 (v0.9.21)

- 조회수는 계속 변하므로 **업로드 1일 뒤, 7일 뒤 두 번만** 기록한다 (`performance_metrics`, source `youtube-d1`·`youtube-d7`). 같은 시점은 한 번만
- 대상: 본인이 등록했고, 생성 콘텐츠와 연결됐고, 업로드 완료이며, URL 이 YouTube 영상인 업로드
- 언제: 업로드 관리·AI 학습 관리 화면을 열 때 응답을 보낸 뒤(`after()`) 본인 YouTube Data API 키로 확인 (cron·서비스 키 없음). 기록되면 학습 프로필 업데이트 신호(`scheduleLearning`)
- 비용: `videos.list` 1번(영상 50개까지) = 1 unit
- 날짜 패널에서 YouTube 업로드는 "지금 조회 · 좋아요 · 댓글 (1일 후 · 7일 후)"를 보여 준다 (지금 숫자는 1시간 캐시)
- 키가 없거나 데모 모드면 건너뛴다 (데모는 가짜 숫자)
- **기준 시각** (v0.9.28): 실제 업로드일, 없으면 **예약일**. 예약 시각이 지난 '예약' 건도 그때부터 1일·7일을 센다

## 5-2. 조회수 직접 입력 (v0.9.28)

- 업로드 등록·수정 창의 **조회수 (직접 입력)** → `performance_metrics` (source `manual`, 측정 시각 = 저장 시각). 날짜 패널에 "직접 넣은 조회수 N · 날짜"
- 생성 콘텐츠와 연결된 **내** 업로드만 (직접 등록은 학습에 쓸 콘텐츠가 없어 거부)
- 저장하면 학습 신호(`scheduleLearning`). 학습 프로필은 같은 유형 콘텐츠의 조회수 **중앙값과 비교해** '잘된 영상(2배 이상)'·'반응 낮음(절반 이하)'으로 표시해 AI 에 보낸다 (`performanceTiers`)
- 생성할 때 좋은 예시 고르기: 이 기능 콘텐츠 중 조회수가 중앙값 이상이면 긍정 예시, 높을수록 더 자주 고른다 (최대 3배)

## 6. API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/publications?from&to` | 기간 안 업로드 기록 (팀 전체, canEdit·canDelete 포함) |
| POST | `/api/publications` | 등록 |
| PUT / DELETE | `/api/publications/:id` | 수정 / 삭제 |
| GET | `/api/publications/status?ids=` | 콘텐츠별 업로드 상태 |
| GET | `/api/publications/stats?ids=` | YouTube 업로드의 지금 조회수·좋아요·댓글 + 1일·7일 기록 |
| GET | `/api/publications/assignees` | 담당자 후보 (관리자: 승인된 직원, 직원: 본인) |
