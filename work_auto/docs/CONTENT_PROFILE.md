# CONTENT PROFILE — 콘텐츠 프로필

> 콘텐츠 프로필 = **무엇을 다룰 것인가** (관심분야)
> 나의 스타일 = **어떻게 표현할 것인가** (말투·구조·Hook·CTA)
>
> 두 데이터는 절대 합치지 않는다.

## 1. 왜 필요한가

사용자는 보통 한 분야(예: 가전)를 중심으로 YouTube·NAVER 클립·NAVER 블로그를 함께 운영한다.
콘텐츠 프로필이 없으면 트렌드 화면에 들어갈 때마다 다음을 반복해야 한다.

- 카테고리 고르기
- 관심 키워드 입력하기
- 원하지 않는 결과(중고, B2B 등) 걸러내기

콘텐츠 프로필에 관심분야를 한 번 저장해 두면 아래 화면과 기능에 **자동으로** 적용된다.

- 세 트렌드 화면
- 콘텐츠 생성 AI

채널 선택은 메뉴(YouTube / NAVER 클립 / NAVER 블로그)에 들어가는 것으로 이미 끝났다고 본다.
그래서 프로필 화면에서 "어떤 채널인가요?"를 다시 묻지 않는다.

## 2. 나의 스타일과의 차이

| | 콘텐츠 프로필 | 나의 스타일 |
|---|---|---|
| 질문 | 무엇을 다루나? | 어떻게 쓰나/말하나? |
| 내용 | 대표 카테고리, 세부 관심분야, 관심 키워드, 제외 키워드, 국가, 기본 분석기간 | 톤, 규칙, 자주 쓰는 표현, 금지 표현, Hook, CTA, 적용 채널 |
| 쓰는 곳 | 트렌드 조사 범위 + 생성 Context | 생성 Context |
| 기본값 | 사용자당 기본 프로필 1개 | 채널마다 기본 스타일 1개 |
| 연결 | — | 스타일에 "적용 콘텐츠 프로필"을 선택 항목으로 연결할 수 있다 |

예: 스타일 "친근한 가전 리뷰어"
- 적용 콘텐츠 프로필: 가전 콘텐츠
- 적용 채널: YouTube
- 톤: 친근하고 빠른 말투

이 스타일로 생성하면 "가전 콘텐츠" 프로필이 Context에 들어간다.

## 3. 데이터 모델 (`lib/types/profile.ts`, 테이블 `content_profiles`)

| 필드 | 설명 |
|------|------|
| id, userId | |
| name, description | 예: 가전 콘텐츠 |
| mainCategory | 대표 카테고리. 예: 가전 |
| subCategories[] | 세부 관심분야. 예: 주방가전, 생활가전, 계절가전, 살림가전 |
| seedKeywords[] | 기본 관심 키워드 (트렌드 조사의 출발점). 예: 가전추천, 가성비가전, 살림템, 신혼가전 |
| excludeKeywords[] | 제외 키워드. 트렌드 결과에서 빼고 생성에서도 다루지 않는다. 예: 산업용, B2B, 중고가전 |
| defaultTrendPeriod | 기본 분석기간(일): 7, 14, 21, 30, 90 |
| country | 기본 국가 (YouTube regionCode). 예: KR |
| isDefault | 기본 프로필. 사용자당 1개이며 서비스에서 보장한다 |
| isActive | 사용 중 여부. 끄면 자동 적용과 전환 목록에서 빠진다 |
| createdAt, updatedAt | |

- 예시 프로필(`EXAMPLE_PROFILE`)은 "가전 콘텐츠"다.
  - 데모 모드에서는 시드 데이터로 들어 있다.
  - 실제 계정에서는 콘텐츠 프로필 탭의 **[예시로 시작]** 버튼으로 만들 수 있다.
- 사용자의 첫 프로필은 자동으로 기본 프로필이 된다.
- 기본 프로필을 삭제하면 남은 프로필 중 하나가 기본이 된다.
- 스타일 연결: `user_styles.profile_id`에 `on delete set null`이 걸려 있다. 그래서 프로필을 지우면 스타일은 그대로 두고 연결만 푼다.

## 4. 트렌드 분석에서 사용하는 방법

### 4.1 공통

- 트렌드 화면 3개 위쪽에 작은 **"현재 분석 기준"** 바(`features/content-profile/ProfileBar.tsx`)를 둔다. 바에는 다음이 보인다.
  - 프로필 이름
  - 카테고리 · 세부 관심분야
  - #기본 키워드
  - [프로필 적용] 체크박스
  - [프로필 수정 →] 링크
- 프로필이 **2개 이상**일 때만 바 안에 전환 선택이 나타난다. 고른 프로필은 이 브라우저에만 기억한다(`localStorage`). 화면 편의 기능이라 DB에는 저장하지 않는다.
- 트렌드 API에는 `profileId`만 보낸다. 서버가 `contentProfileService.resolveScope()`로 프로필을 **조사 범위(`TrendScope`)**로 바꿔 Provider에 넘긴다.
  - 비어 있음 → 자동 적용 프로필 (사용 중인 기본 프로필 → 첫 프로필)
  - `"none"` → 프로필 없이 조회 ([프로필 적용]을 끈 경우)
  - 그 밖의 값 → 해당 프로필 (내 것이 아니면 없는 것으로 본다)
- **검색어 칸은 그대로 유지한다.** 검색어의 역할은 "이번 분석에서 프로필 범위 안을 더 좁혀 조사할 키워드"다.
  - 예: 프로필 = 가전 콘텐츠, 검색어 = 음식물처리기 → 가전 콘텐츠 범위 안에서 음식물처리기를 중심으로 분석한다.

### 4.2 YouTube 트렌드 찾기

- 처음 열 때 검색 조건은 다음 순서로 정한다.
  1. **기본 저장 조건**
  2. 없으면 **프로필의 국가·기본 분석기간**
  3. 둘 다 없으면 기본값 (한국, 최근 7일, 구독자 0~5만, 조회수 1만 이상)
- 검색어 `q`는 `buildYouTubeSearchQ()`(`lib/domain/youtube.ts`)로 만든다.
  - 검색어가 있으면 그 검색어로 좁힌다.
  - 없으면 관심 키워드와 세부 관심분야를 `|`(OR)로 묶는다. 예: `가전추천|가성비가전|살림템|…`
  - 제외 키워드는 `-산업용 -B2B` 형식으로 붙인다. 받아온 결과에서도 `matchesRanges()`로 제목·태그를 한 번 더 거른다.
- **저장한 조건과 역할이 다르다.**
  - 콘텐츠 프로필 = 항상 자동 적용되는 관심분야
  - 저장한 조건 = "최근 7일 Shorts / 조회수 10만 이상 / 구독자 10만 이하" 같은 검색 프리셋
  - 저장한 조건에는 `profileId`를 저장하지 않는다(서버가 지운다). 두 데이터 구조는 따로 유지한다.
- 생성 화면의 "참고 트렌드" 목록에도 기본 프로필 범위를 적용한다.

### 4.3 NAVER 클립 · NAVER 블로그

- 같은 프로필을 자동으로 적용하지만, **분석 엔진은 YouTube와 공유하지 않는다** (`NaverApiProvider`).
- 프로필에서 받는 것은 "무엇을 조사할지"(후보 키워드)뿐이다.
  - 출발점 = 검색어 → 없으면 관심 키워드 + 세부 관심분야 → 프로필이 없으면 카테고리 기본 키워드
  - 급상승·관련 검색어·시즌 키워드·글감 아이디어 모두 이 후보에서 시작하고, 제외 키워드가 들어간 것은 뺀다.
- 프로필을 적용하면 카테고리 선택 칸을 숨긴다. 프로필이 없거나 [프로필 적용]을 끄면 카테고리 선택이 다시 나타난다.

## 5. 채널별 분석 엔진과의 관계

```
ContentProfile ──(resolveScope)──▶ TrendScope { mainCategory, subCategories, seedKeywords, excludeKeywords }
                                        │
                ┌───────────────────────┼────────────────────────┐
                ▼                       ▼                        ▼
   YouTubeTrendProvider        NaverTrendProvider (clip)   NaverTrendProvider (blog)
   - q = OR(관심 키워드) -제외   - 데이터랩 급상승·시즌        - + 검색 추이 · 검색량 · 블로그 문서 수
   - 구독자·조회수 범위          - 검색광고 연관 키워드        - 관련 검색어 · 글감 아이디어
```

- Provider는 `TrendScope`만 알고, 프로필 테이블이나 서비스는 모른다.
- 채널을 추가하면 같은 `TrendScope`를 받는 Provider를 하나 더 만든다. 예: Instagram이면 해시태그 OR 검색.

## 6. 여러 프로필로 확장하는 방식

- 지금은 기본 프로필 1개를 자동 적용하는 흐름이 중심이다. 프로필은 최대 10개까지 만들 수 있다.
- 2개 이상이면 다음과 같이 쓴다.
  - 트렌드 화면: "현재 분석 기준" 바에서 전환한다. 브라우저별로 기억한다.
  - 생성: 생성 폼의 **"콘텐츠 프로필"** 선택(v0.8.0, 프로필이 2개 이상일 때만 보임) → 스타일에 연결된 프로필 → 기본 프로필 순서로 쓴다.
- 이후 확장 후보:
  - 프로필별 저장 조건 묶기 (`saved_filters.profile_id`)
  - 프로필별 성과 통계

## 7. 생성 AI Context에 포함되는 방식

`buildGenerationContext()`(`lib/server/ai/context-builder.ts`)가 조립하는 순서는 다음과 같다.

```
고정 프롬프트
 + 현재 콘텐츠 프로필   contentProfile   (생성 폼에서 고른 프로필 → 스타일에 연결된 프로필 → 기본 프로필)
 + 현재 채널 스타일     style            (생성 폼에서 고른 스타일 → 채널 기본 스타일)
 + 제품 데이터          product
 + 현재 트렌드 데이터   trend
 + 과거 좋은 생성 결과  exemplars
 + 사용자 피드백        avoid
 + 성과 데이터          performanceHints
 → AI 생성
```

- 프롬프트에는 `[콘텐츠 프로필 (이 사용자가 다루는 분야)]` 블록으로 들어간다. 콘텐츠 프롬프트 v1.2.0부터 해당하며, 블록 내용은 다음과 같다.
  - 대표 카테고리
  - 세부 관심분야
  - 관심 키워드 (자연스럽게 맞으면 활용)
  - 제외 키워드 (다루지 않는다)
- 결과에는 `context.profile`(id, name)을 기록한다. 결과 패널의 "사용된 학습 데이터"와 콘텐츠 히스토리에 표시된다.
- 프로필이 없으면 `notes`에 안내를 남긴다. 생성은 그대로 진행한다.
- 요청에서 말한 `{ contentProfile, channelStyle, product, trendData, goodExamples, feedback, performance }`는 `GenerationContext`의 `contentProfile, style, product, trend, exemplars, avoid, performanceHints`와 1:1로 대응한다.

## 8. 관련 파일

| 구분 | 파일 |
|------|------|
| 타입 | `lib/types/profile.ts` (ContentProfile, TrendScope, toTrendScope, hasExcluded, EXAMPLE_PROFILE) |
| 서비스 | `lib/server/services/content-profiles.ts` (list, getActive, resolveScope, create, update, setDefault, remove) |
| API | `app/api/profiles/route.ts`, `app/api/profiles/[profileId]/route.ts` |
| 화면 | `features/ai-learning/ContentProfileTab.tsx`, `features/content-profile/{ProfileBar.tsx,useContentProfile.ts}` |
| 트렌드 | `lib/domain/youtube.ts` (buildYouTubeSearchQ), `lib/server/providers/trends/naver-api-provider.ts` |
| 생성 | `lib/server/ai/context-builder.ts`, `lib/server/ai/prompts/render.ts` |
| DB | `supabase/schema.sql` (`content_profiles`, `user_styles.profile_id`) |
