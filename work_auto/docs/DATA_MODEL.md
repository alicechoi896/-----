# DATA MODEL: 콘텐츠 자동화 센터

> 타입 정의: `lib/types/*.ts` (클라이언트·서버 공용, 단일 기준)
> V1 저장소: `lib/server/repositories/memory-store.ts` (인메모리, Seed: `lib/mock/seed.ts`)
> Supabase 저장소: `lib/server/repositories/supabase-store.ts`, **실제 스키마: `supabase/schema.sql`** (이 문서 4장보다 우선)

## 1. 전체 관계도

```
UserProfile 1─┬─N ApiConnection          (profiles: 역할 admin/silver/gold/vip)            (BYOK 자격증명, 암호화)
       ├─N Product 1─┬─N ProductSource      (수집 원문: Collector 출력)
       │             ├─N ProductAnalysis    (AI 분석: Analyzer 출력, version)
       │             └─N GeneratedContent   (이 제품으로 만든 콘텐츠)
       ├─N ContentProject 1─N GeneratedContent   (V2부터 UI에서 사용)
       ├─N GeneratedContent 1─┬─N UserFeedback
       │                      └─N PerformanceMetric
       ├─N UserStyle                         (채널별 기본 1개)
       └─N ReferenceVideo                    (영상 URL 가져오기)

TrendItem / Keyword: 외부 Provider 조회 결과 (V1은 저장하지 않고, V2에서 캐시 테이블로 저장)
```

## 2. AI Memory 분류

| Memory | Entity | 생성 시 사용 방식 |
|--------|--------|-------------------|
| Product Memory | Product + ProductAnalysis | 선택한 제품의 현재 분석을 [제품 정보] 블록으로 주입 |
| Style Memory | UserStyle | 채널 기본 스타일을 [스타일] 블록으로 주입 |
| Content History | GeneratedContent (`isExemplar=true`) | 같은 기능의 좋은 결과 2건을 [좋은 예시]로 주입 |
| Feedback Data | UserFeedback (`rating=down`) | 최근 3건의 사유·수정본을 [피해야 할 패턴]으로 주입 |
| Performance Data | PerformanceMetric | 같은 채널 성과 상위 2건을 [성과가 좋았던 콘텐츠]로 주입 |

자세한 내용은 [AI_LEARNING_SYSTEM.md](./AI_LEARNING_SYSTEM.md)를 본다.

## 3. Entity 상세

### UserProfile (profiles)
**왜 필요한가**: 모든 데이터의 소유자이고 **역할(권한)**을 가진다. Supabase `auth.users`와 1:1이며, 가입하면 트리거가 `silver`로 만든다. 데모 모드는 `demo-user`(관리자) 하나다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | uuid | PK = auth.users.id |
| email | string | |
| name | string | 가입 시 입력한 이름 |
| role | `admin` \| `silver` \| `gold` \| `vip` | 변경은 관리자만 (RLS + 보호 트리거) |
| status | `pending` \| `active` \| `rejected` | 가입 승인 상태. 가입 시 pending |
| approvedAt / approvedBy | ISO / uuid | 승인·거절 처리 시각과 관리자 |
| termsAgreedAt | ISO | 약관·개인정보처리방침 동의 시각 |
| createdAt / updatedAt | ISO | |

### AuditLog (audit_logs)
**왜 필요한가**: 누가 언제 무엇을 했는지 남긴다 (승인, 등급·권한 변경, 로그인, 탈퇴 등). 보안 사고 대응과 분쟁 해결용.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK |
| actorId / actorEmail / actorName | uuid / string | 수행자. FK 없이 복사해 두어 탈퇴 후에도 읽을 수 있다 |
| action | string | `user.approve`, `permission.change`, `auth.login` … (`lib/audit-labels.ts`) |
| targetType / targetId / targetLabel | string | 대상 |
| detail | jsonb | 변경 전후 값, 거절 사유 등 |
| createdAt | ISO | |

보관: 탈퇴한 사용자의 기록은 1년 후 자동 삭제. 조회는 관리자만, 수정·삭제 불가.

### RolePermission (role_permissions)
**왜 필요한가**: 관리자가 권한 관리에서 **기본값과 다르게 바꾼 칸만** 저장한다. 나머지는 Registry `defaultTiers`를 따르므로 새 메뉴를 추가해도 DB 작업이 필요 없다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | `{role}:{permissionKey}` |
| role | `silver` \| `gold` \| `vip` | 관리자는 항상 전체 허용이라 저장하지 않는다 |
| permissionKey | string | 기능 ID 또는 단독 페이지 ID |
| allowed | boolean | |
| updatedAt | ISO | |

### ApiConnection
**왜 필요한가**: 사용자가 자기 API Key를 연결한다(BYOK). Provider 선택(`getAIProvider`)이 이 테이블을 본다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK |
| userId | FK UserProfile | |
| provider | `openai` \| `youtube` \| `naver` | 사용자당 provider 1개 (unique) |
| status | `disconnected` \| `connected` \| `error` | |
| encryptedCredentials | string \| null | AES-256-GCM `iv.tag.cipher` (base64). **절대 클라이언트로 보내지 않는다** |
| maskedHint | string \| null | `sk-…ab12` |
| lastTest | {ok, message, testedAt, mock} \| null | 최근 테스트 결과 |
| createdAt / updatedAt | ISO | |

공개 DTO `ApiConnectionPublic` = `encryptedCredentials`, `userId`를 뺀 형태.

### Product
**왜 필요한가**: 제품 라이브러리의 한 항목이다. 목록 화면에 필요한 요약 필드를 가진다. 분석 원문 전체는 ProductAnalysis에 있다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK |
| userId | FK | |
| name, brand, category, seller | string | 기본 정보 (목록·검색용) |
| imageUrl | string \| null | 대표 이미지 (Mock은 null → 색 플레이스홀더) |
| sourceUrl | string \| null | 원본 상품 URL |
| oneLiner | string | 한 줄 설명 |
| keyBenefits | string[] | 주요 장점 (카드에 3개 표시) |
| tags | string[] | 검색용 태그 |
| currentAnalysisId | FK ProductAnalysis | **생성 시 이 분석을 쓴다** |
| createdAt / updatedAt | ISO | 저장일 |
| lastUsedAt | ISO \| null | 콘텐츠 생성에 마지막으로 쓴 시각 (재사용 지표) |

### ProductSource
**왜 필요한가**: Collector가 수집한 **원문**을 보관한다. 분석 프롬프트를 개선했을 때 다시 수집하지 않고 재분석할 수 있다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK |
| productId | FK | |
| type | `url` \| `image` \| `text` | 입력 방식 |
| raw | RawProductData | title, brand, price, category, imageUrls, descriptionText, specs, reviewSnippets, collectedBy, collectedAt |
| createdAt | ISO | |

### ProductAnalysis
**왜 필요한가**: AI Analyzer의 구조화된 출력이다. Product Memory의 실체다. 재분석하면 version이 올라가고, 이전 버전은 이력으로 남는다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | PK |
| productId | FK | |
| version | number | 1부터 |
| basicInfo | {name, brand, category, seller, url} | 기본 정보 |
| summary | {oneLiner, keyFeatures[], keyBenefits[], differentiators[], targetAudience[], buyingPoints[], cautions[]} | AI 제품 요약 |
| contentData | {videoPoints[], blogPoints[], keywords[], hooks[], forbiddenExpressions[]} | 콘텐츠 제작용 데이터 |
| meta | {provider, model, promptId, promptVersion} | 어떤 AI·프롬프트로 분석했는지 |
| createdAt | ISO | |

### ContentProject
**왜 필요한가**: 같은 제품이나 캠페인으로 만든 영상·클립·블로그 결과물을 묶는다. 타입과 필드는 V1에 정의되어 있고, UI는 V2부터 쓴다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id, userId | | |
| channelId | ChannelId | 대표 채널 |
| title | string | 프로젝트명 |
| productId | FK \| null | |
| status | `active` \| `archived` | |
| createdAt / updatedAt | ISO | |

### GeneratedContent
**왜 필요한가**: 모든 생성 결과의 이력(Content History)이다. 재현에 필요한 정보(프롬프트 버전, 모델, 사용한 Context)를 함께 저장한다.

| 필드 | 타입 | 설명 |
|------|------|------|
| id, userId | | |
| projectId | FK \| null | |
| featureId | string | Registry 기능 ID (예: `yt-product-video`) |
| channelId | ChannelId | |
| productId | FK \| null | |
| input | JSON | 사용자 폼 입력 그대로 |
| output | Record<key, string \| string[]> | Generator Config의 outputs key 기준 |
| headline | string | 목록용 대표 제목 |
| promptId / promptVersion | string | 예: `youtube.product-video` / `1.0.0` |
| provider / model | string | 예: `openai` / `gpt-4o-mini`, `mock` / `mock-writer-v1` |
| context | ContextSummary | 사용한 제품(분석 버전), 스타일, 예시 ID, 피드백 메모, 성과 힌트, 트렌드, 경고 |
| isExemplar | boolean | "좋은 결과로 저장" → few-shot 예시 후보 |
| rating | `up` \| `down` \| null | 최근 평가 |
| createdAt | ISO | |

### TrendItem (YouTubeTrendItem, NaverRisingTopic)
**왜 필요한가**: 트렌드 조회 결과의 공통 형태다. 생성할 때 Trend Context로 쓴다. V1은 Provider가 매번 계산하고, V2는 할당량 절약을 위해 캐시 테이블(`trend_snapshots`)에 저장한다.

| 공통 필드 | 설명 |
|-----------|------|
| id, source(`youtube`/`naver`), title, category, keywords[], trendScore(0~100), collectedAt | |

| YouTube 전용 | NAVER 전용 |
|--------------|------------|
| videoId, url, channelId, channelName, channelSubscribers, thumbnailColor/Url, publishedAt, durationSec, format(`shorts`/`long`, 3분 이하 Shorts), views, viewsPerDay, commentCount, likeCount, tags[], description(500자), country | description, growthRate |

`YouTubeTrendQuery` = { country, categoryId, keyword, publishedFrom/To, recentDays, format, min/maxSubscribers, min/maxViews(미만), minComments, pageToken } → `YouTubeTrendPage` = { items, nextPageToken, fetched }

`NaverTrendInsight` = { risingTopics, risingKeywords, seasonalKeywords, relatedKeywords, searchTrend[{date,value}], contentIdeas }

### Keyword
**왜 필요한가**: 트렌드, 제품 분석, 생성 결과에서 키워드를 같은 형태로 다룬다.

| 필드 | 설명 |
|------|------|
| text | 키워드 |
| source | `youtube` \| `naver` \| `ai` \| `user` |
| volume? | 월간 검색량 |
| growthRate? | 증가율(%) |
| competition? | `low` \| `mid` \| `high` |

### UserStyle
**왜 필요한가**: Style Memory다. 스타일을 여러 개 만들어 생성 화면의 "스타일"에서 고른다. 고르지 않으면 채널 기본 스타일이 자동으로 적용된다.

| 필드 | 설명 |
|------|------|
| id, userId | |
| name | 예: 친근한 리뷰어 |
| channelIds[] | 적용 채널 (여러 개). 빈 배열 = 모든 채널. DB 의 예전 `channel_id` 는 schema.sql 재실행 시 옮겨지고 비워진다 |
| tone, description | 톤과 설명 |
| rules[] | 지켜야 할 규칙 |
| examplePhrases[] | 자주 쓰는 표현 |
| bannedPhrases[] | 금지 표현 |
| hooks[] | 자주 쓰는 Hook (초반 3초 문장), 최대 20개 |
| ctas[] | 자주 쓰는 CTA (마지막 행동 유도), 최대 20개 |
| isDefault | 채널마다 기본 1개. 적용 채널이 겹치는 다른 기본 스타일은 해제 (서비스에서 보장) |
| createdAt / updatedAt | |

### UserFeedback
**왜 필요한가**: 사용자가 결과를 어떻게 평가했는지 남긴다. "별로예요" 사유와 **사용자 수정본**이 가장 강한 학습 신호다.

| 필드 | 설명 |
|------|------|
| id, userId | |
| contentId | FK GeneratedContent |
| featureId | 조회용 (같은 기능의 다음 생성에 반영) |
| rating | `up` \| `down` |
| reason | string \| null |
| editedOutput | Record<key, value> \| null | 사용자가 직접 고친 결과 |
| createdAt | |

### PerformanceMetric
**왜 필요한가**: 실제로 잘된 콘텐츠의 특징을 다음 생성에 반영한다. V1은 Mock/수동 입력이고, V2에서 플랫폼 API와 연동한다.

| 필드 | 설명 |
|------|------|
| id, contentId, channelId | |
| platformUrl | 게시된 URL |
| views, clicks, ctr, likes, comments, conversions, revenue | 모두 nullable (플랫폼마다 제공 지표가 다르다) |
| source | `manual` \| `youtube-analytics` \| `naver` \| `mock` |
| measuredAt | 측정 시각 (시계열로 여러 건 저장 가능) |

### ReferenceVideo
**왜 필요한가**: 영상 URL 가져오기로 저장한 참고 영상이다. 제품 홍보 영상의 "참고 영상"으로 고른다.

| 필드 | 설명 |
|------|------|
| id, userId, url (사용자당 unique) | |
| platform | `youtube` \| `naver` \| `other` |
| title, channelName, durationSec, thumbnailColor | 메타데이터 |
| note | 메모 |
| createdAt | |

### SavedFilter (saved_filters)
**왜 필요한가**: 자주 쓰는 트렌드 검색 조건을 저장한다. 기본 조건(isDefault, 사용자당 1개)은 화면을 열 때 자동 적용되고 생성 화면 "참고 트렌드" 목록의 기준이 된다.

| 필드 | 설명 |
|------|------|
| id, userId, kind(`youtube-trend`), name(사용자당 같은 이름은 덮어씀) | 사용자당 30개 |
| params (jsonb) | YouTubeTrendQuery (pageToken 제외). recentDays 가 있으면 쓸 때 오늘 기준으로 날짜 재계산 |
| isDefault, createdAt, updatedAt | |

### SavedTrend (saved_trends)
**왜 필요한가**: 찜한 트렌드 영상. 생성 화면 "참고 트렌드"에 ★로 먼저 나온다. 영상 정보 텍스트만 저장한다 (썸네일은 YouTube 주소만).

| 필드 | 설명 |
|------|------|
| id, userId, trendId(`yt_{videoId}`, 사용자당 unique), videoId, source | 사용자당 300개 |
| title, format, url, channelName, thumbnailUrl, keywords[], tags[], views, publishedAt | |
| analysis (jsonb) | AI 분석 결과 { reasons, titleSuggestions, keywords } — 찜한 영상을 분석하면 함께 저장 |
| createdAt | |

## 4. V2 테이블 설계 (Postgres)

```sql
-- 이름은 snake_case, 모든 테이블에 user_id + RLS(user_id = auth.uid())
create table api_connections (id uuid pk, user_id uuid, provider text, status text,
  encrypted_credentials text, masked_hint text, last_test jsonb, created_at timestamptz, updated_at timestamptz,
  unique (user_id, provider));
create table products (id uuid pk, user_id uuid, name text, brand text, category text, seller text,
  image_url text, source_url text, one_liner text, key_benefits text[], tags text[],
  current_analysis_id uuid, created_at timestamptz, updated_at timestamptz, last_used_at timestamptz);
create table product_sources (id uuid pk, product_id uuid references products on delete cascade,
  type text, raw jsonb, created_at timestamptz);
create table product_analyses (id uuid pk, product_id uuid references products on delete cascade,
  version int, basic_info jsonb, summary jsonb, content_data jsonb, meta jsonb, created_at timestamptz,
  unique (product_id, version));
create table content_projects (...);
create table generated_contents (id uuid pk, user_id uuid, project_id uuid, feature_id text, channel_id text,
  product_id uuid references products on delete set null, input jsonb, output jsonb, headline text,
  prompt_id text, prompt_version text, provider text, model text, context jsonb,
  is_exemplar boolean default false, rating text, created_at timestamptz);
create index on generated_contents (user_id, feature_id, is_exemplar);
create table user_styles (...);       -- partial unique index: (user_id, channel_id) where is_default
create table user_feedback (...);     -- index (user_id, feature_id, rating, created_at desc)
create table performance_metrics (...);
create table reference_videos (...);  -- unique (user_id, url)
-- V2+: content_embeddings (content_id, embedding vector(1536)) — 좋은 결과 의미 검색(RAG)
```

전환 절차는 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) "저장소 교체"를 본다.
