# ARCHITECTURE — 자동화 지니

> 이 문서는 "코드가 어디에 있고, 데이터가 어떻게 흐르며, 무엇을 어디에 추가해야 하는가"를 설명한다.
> 새 기능을 만들기 전에 반드시 읽는다. 구체적인 추가 절차는 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)에 있다.

---

## 1. 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **Next.js 16 (App Router)** | 페이지와 API(Route Handler)를 한 저장소에서 관리한다. 형제 프로젝트(auto_genie, mbti-test)와 같은 스택이다 |
| 언어 | TypeScript (strict) | Entity, Provider 인터페이스를 타입으로 강제한다 |
| UI | React 19 + Tailwind CSS v4 | `@theme` 토큰으로 디자인 시스템을 CSS 한 곳에서 정의한다 |
| 아이콘 | lucide-react | 선 굵기가 일정한 단색 아이콘 |
| 폰트 | Pretendard Variable (로컬, `next/font/local`) | 한국어 가독성이 좋고 외부 요청이 없다 |
| 저장소 | 인메모리 Repository (V1) → Supabase/Postgres (V2) | Repository 인터페이스로 교체할 수 있다 |
| 보안 | Node `crypto` AES-256-GCM | API Key를 서버에서 암호화한다 |
| 배포 지역 | Vercel 서버 함수 **서울(icn1)** (`vercel.json`), Supabase 서울 | 서버와 DB 를 같은 지역에 두어 DB 왕복 지연을 없앤다. 지역을 바꾸면 반드시 둘을 같이 옮긴다 |

## 2. 전체 시스템 구조

```
┌──────────────────────────── Browser (Client) ────────────────────────────┐
│  app/**/page.tsx (Server Component, 얇은 껍데기)                          │
│        └─ features/** (Client Component: 상태, 폼, 결과 렌더링)            │
│              └─ components/ui · layout · shared (공통 UI)                  │
│              └─ lib/api-client (fetch 래퍼, 타입 안전)                     │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ HTTP (JSON)  ※ API Key는 이 경계를 넘어 돌아오지 않는다
┌──────────────────────────────────▼───────────── Server (Node) ────────────┐
│  app/api/**/route.ts  (Route Handler: 입력 검증 → Service 호출 → JSON)     │
│        └─ lib/server/services/**   (유스케이스: 비즈니스 흐름 조립)        │
│              ├─ lib/server/ai/      (ContextBuilder, Prompt 템플릿·버전)    │
│              ├─ lib/server/providers/ (AIProvider · TrendProvider ·        │
│              │                         ProductDataCollector 구현체)         │
│              ├─ lib/server/repositories/ (저장소 인터페이스 + 인메모리 구현) │
│              └─ lib/server/security/ (API Key 암호화)                      │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
            OpenAI API      YouTube Data API      NAVER API      (V1: Mock 구현체가 대신 응답)
```

### 2.1 Frontend / Backend 구분 원칙

| 규칙 | 설명 |
|------|------|
| `lib/server/**`는 서버 전용 | 모든 파일 상단에 `import "server-only"`를 둔다. 클라이언트에서 import하면 빌드가 실패한다 |
| 클라이언트는 `lib/api-client`로만 서버와 통신한다 | 클라이언트 컴포넌트가 Provider나 Repository를 직접 import하지 않는다 |
| 외부 API는 Provider로만 호출한다 | Service나 Route Handler에서 `fetch("https://api.openai.com...")`를 직접 쓰지 않는다 |
| 공유 타입은 `lib/types` | Entity와 요청/응답 타입은 클라이언트와 서버가 같이 쓴다 (런타임 코드 없음) |
| 공유 설정은 `lib/registry`, `lib/generators` | 메뉴, 기능 정의, 생성 폼 스키마는 순수 데이터라서 양쪽에서 쓴다 |

## 3. 폴더 구조

```
work_auto/
├── proxy.ts                          # 세션 갱신 + 비로그인 시 /login (Next 16 의 middleware)
├── app/                              # 라우팅 (페이지 = 얇은 껍데기)
│   ├── layout.tsx                    # 폰트, 전역 스타일만
│   ├── (app)/                        # 로그인 후 화면 (URL 에는 안 나타나는 그룹)
│   │   ├── layout.tsx                # 세션 확인 + AppShell(사이드바 + 메인)
│   │   ├── page.tsx                  # 1차: 채널 선택
│   │   ├── youtube/ naver-clip/ naver-blog/ tools/   # 2차: 채널 허브(page.tsx) + 3차: 기능 폴더
│   │   ├── ai-learning/  settings/
│   │   └── admin/                    # 사이트 관리 (관리자 전용)
│   ├── (auth)/login/                 # 로그인·회원가입 (사이드바 없음)
│   ├── auth/callback/                # 인증 메일 링크 처리
│   └── api/                          # Route Handler (Backend for Frontend)
├── supabase/schema.sql               # DB 테이블, RLS, 가입 트리거
├── components/
│   ├── ui/                           # 원자 컴포넌트 (Button, Input, Tabs, DataTable …)
│   ├── layout/                       # AppShell, AppSidebar, PageHeader, PageContainer
│   └── shared/                       # 도메인 공용 (FeatureCard, ProductCard, ResultPanel …)
├── features/                         # 기능별 화면 로직 (Client Component)
│   ├── content-generator/            # ★ 생성형 기능 7개가 공유하는 범용 생성기
│   ├── youtube-trends/  naver-trends/
│   ├── product-learning/  product-library/  video-import/   (video-import/XhsSearchPanel = 샤오홍슈 검색 탭)
│   ├── ai-learning/  api-center/  home/
├── lib/
│   ├── registry/                     # ★ Feature Registry (채널, 기능 정의)
│   ├── generators/                   # ★ Generator Config (생성형 기능의 입력/출력 스키마)
│   ├── types/                        # Entity, DTO 타입
│   ├── domain/                       # 순수 도메인 함수 (Trend Score 등)
│   ├── mock/                         # Seed / Mock 데이터
│   ├── api-client/                   # 클라이언트 fetch 래퍼
│   ├── utils.ts                      # cn(), 포맷 함수
│   └── server/                       # 서버 전용
│       ├── providers/                # ★ Provider Pattern
│       ├── repositories/             # 저장소
│       ├── services/                 # 유스케이스
│       ├── ai/                       # ★ AI Memory: ContextBuilder, prompts
│       ├── security/                 # 암호화
│       └── http.ts                   # Route Handler 공통 응답
└── docs/                             # 이 문서들
```

### 3.1 왜 이렇게 나눴는가

- **`app/`은 얇게**: 페이지 파일은 Registry에서 메타를 꺼내 `PageHeader` + `features/*` 컴포넌트를 배치하는 일만 한다. 라우팅을 바꿔도 기능 코드는 움직이지 않는다.
- **`features/` vs `components/`**: `components`는 "어디에 써도 되는 것", `features`는 "특정 기능 화면에만 쓰는 것"이다. 두 기능 이상에서 쓰이기 시작하면 `components/shared`로 올린다.
- **`lib/server/` 격리**: API Key, 외부 호출, 저장소가 모두 여기 있다. `server-only`로 클라이언트 유출을 컴파일 단계에서 막는다.

## 4. 핵심 패턴

### 4.1 Feature Registry (단일 진실 공급원)

`lib/registry/channels.ts`, `lib/registry/features.ts`에 채널과 기능을 **데이터로** 정의한다.

```ts
// lib/registry/features.ts (발췌)
{
  id: "yt-product-video",
  channelId: "youtube",
  order: 2,
  title: "제품 홍보 영상 만들기",
  description: "...",
  href: "/youtube/product-video",
  icon: Clapperboard,
  kind: "generator",          // trend | generator | tool | settings
  status: "mock",             // live | mock | planned
  requiredProviders: ["openai"],
  inputs: ["제품", ...],
  outputs: ["추천 제목 5개", ...],
}
```

이 데이터에서 다음이 **자동으로** 만들어진다.
- 메인 화면 채널 카드와 기능 수
- 채널 허브의 FeatureCard 목록 (`ChannelHub`)
- 사이드바 메뉴와 활성 상태
- 각 페이지의 `PageHeader` 제목, 설명, 브레드크럼, 상태 배지
- [FEATURE_REGISTRY.md](./FEATURE_REGISTRY.md) 표 (문서는 이 파일과 맞춰서 갱신한다)

→ 기능이 30개가 되어도 "메뉴를 어디에 추가해야 하지?" 하는 문제가 생기지 않는다.

### 4.2 Generator Config (생성형 기능 공통화)

생성형 기능 7개(제품 영상, 정보 영상, 제품 클립, 정보 클립, 제품 블로그, 정보 블로그, 자동 글쓰기)는
**같은 `ContentGenerator` 컴포넌트**를 쓰고, 차이는 `lib/generators/configs.ts`의 설정으로만 표현한다.

```ts
{
  featureId: "yt-product-video",
  promptId: "youtube.product-video",       // lib/server/ai/prompts 에서 버전 관리
  fields: [ { name: "productId", type: "remote-select", source: "products", required: true }, ... ],
  outputs: [ { key: "titles", label: "추천 제목 5개", format: "list" }, ... ],
}
```

- 폼 UI: `fields`를 `DynamicField`가 렌더링한다 (text, textarea, select, segmented, tags, remote-select)
- 결과 UI: `outputs`를 `ResultPanel`이 렌더링한다 (text, longtext, list, tags)
- 서버: 같은 config로 입력을 검증하고, AI에 출력 스키마를 전달한다

### 4.3 Provider Pattern

```
              ┌─────────────── lib/server/providers/types.ts ───────────────┐
              │ AIProvider            generateText / generateStructured      │
              │ YouTubeTrendProvider  searchVideos                           │
              │ NaverTrendProvider    getInsights                            │
              │ ProductDataCollector  collect(source) → RawProductData       │
              │ (공통) BaseProvider   id · label · testConnection()          │
              └──────────────────────────────────────────────────────────────┘
                 ▲ 구현                         ▲ 선택
   ai/mock-ai-provider.ts                lib/server/providers/registry.ts
   ai/openai-provider.ts                   getAIProvider()
   trends/mock-youtube-provider.ts         getYouTubeTrendProvider()
   trends/mock-naver-provider.ts           getNaverTrendProvider()
   product/mock-product-collector.ts       getProductCollector(source)
```

- **Service는 인터페이스에만 의존한다.** `getAIProvider()`가 실제 구현을 고른다.
- 선택 규칙: `PROVIDER_MODE=live`이고 해당 Provider가 연결되어 있으면 실제 구현을 쓰고, 그 외에는 Mock을 쓴다.
- Claude, Gemini 추가 = `ai/claude-provider.ts` 하나와 registry 분기 하나. 기능 코드는 바뀌지 않는다. ([API_PROVIDER_SPEC.md](./API_PROVIDER_SPEC.md))

### 4.4 Repository Pattern

`lib/server/repositories/types.ts`에 저장소 인터페이스(`Repository<T>`, `Repositories`)를 두고 구현체 두 개가 있다.

| 구현 | 파일 | 언제 |
|------|------|------|
| 인메모리 | `memory-store.ts` (globalThis + Seed) | Supabase 환경변수가 없을 때 (데모 모드) |
| Supabase | `supabase-store.ts` (테이블 = Entity 의 snake_case, 로그인 세션으로 접근 → RLS) | `NEXT_PUBLIC_SUPABASE_URL` + anon key 가 있을 때 |

Service는 `getRepositories()`만 호출하므로 어느 쪽이든 코드가 같다.

### 4.5 인증과 권한

- 세션: `lib/server/auth.ts`의 `getSession()` (요청당 1회, Supabase 응답 3초 제한)
- 규칙: `lib/permissions.ts` — 관리자는 전체, 그 외는 `role_permissions`(바꾼 값) ?? Registry `defaultTiers`
- 차단: proxy(비로그인) → `FeaturePage`/`AdminPage`(화면) → `requireAccess`/`requireAdmin`(API) → RLS(DB)
- 자세한 내용: [AUTH_AND_PERMISSIONS.md](./AUTH_AND_PERMISSIONS.md), 설정: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

## 5. 데이터 흐름

### 5.1 제품 상세페이지 학습 (Collector와 Analyzer 분리)

```
[Client] ProductLearningWorkspace
   │ POST /api/products/analyze  { source: { type: "url", url } }
   ▼
[Route] app/api/products/analyze/route.ts   → 입력 검증
   ▼
[Service] productLearningService.analyze(source)
   ├─ 1) collector = getProductCollector(source.type)
   │      raw = await collector.collect(source)          → RawProductData   (수집: HTML/이미지/텍스트 → 원문)
   ├─ 2) analysis = await productAnalyzer.analyze(raw)   → ProductAnalysis  (분석: AIProvider 사용)
   └─ return { raw, analysis }                           ※ 아직 저장하지 않는다 (사용자 확인 단계)
   ▼
[Client] 결과 확인 → [제품 라이브러리에 저장]
   │ POST /api/products  { raw, analysis }
   ▼
[Service] productService.create() → Product + ProductSource + ProductAnalysis 저장
```

### 5.2 콘텐츠 생성 (AI 호출 흐름)

```
[Client] ContentGenerator (featureId, form values)
   │ POST /api/contents/generate { featureId, input }
   ▼
[Service] contentGenerationService.generate()
   ├─ 1) config = getGeneratorConfig(featureId)             입력 검증 (required 필드)
   ├─ 2) context = await contextBuilder.build({...})        ★ AI Memory 조립
   │        ├─ Content Profile   (스타일에 연결된 프로필 → 기본 프로필. "무엇을 다루는가")
   │        ├─ Product Memory    (productId → 저장된 분석. 재분석하지 않는다)
   │        ├─ Style Memory      (생성 폼에서 고른 스타일 → 채널 기본 스타일)
   │        ├─ Content History   (같은 기능의 "좋은 결과" 상위 N개 = few-shot 예시)
   │        ├─ Feedback          (최근 "별로예요" 사유 = 피해야 할 패턴)
   │        ├─ Performance       (성과 상위 콘텐츠의 특징)
   │        └─ Trend             (선택한 트렌드 항목)
   ├─ 3) prompt = renderPrompt(config.promptId, input, context)   고정 프롬프트 + 버전
   ├─ 4) result = await getAIProvider().generateStructured({ messages, schema: config.outputs })
   ├─ 5) repo.contents.create({ ..., promptVersion, provider, model, contextSummary })
   └─ 6) product.lastUsedAt 갱신
   ▼
[Client] ResultPanel: 섹션별 복사 · 좋아요/별로예요(POST /api/feedback) · 좋은 결과로 저장(PATCH /api/contents/:id)
```

**규칙: AI는 절대 "빈 Context"로 호출하지 않는다.** 모든 생성은 `contextBuilder.build()`를 거친다.
Context가 실제로 비어 있으면(제품 없음, 스타일 없음 등) `contextSummary`에 그 사실을 기록하고, UI에도 "사용된 학습 데이터"로 표시한다.

### 5.2.1 트렌드 조회와 콘텐츠 프로필

```
[Client] 트렌드 화면 → ProfileBar(현재 분석 기준) → GET /api/trends/{youtube|naver}?…&profileId=
[Service] trendService → contentProfileService.resolveScope(profileId) → query.scope / query.profileScope (TrendScope)
[Provider] YouTubeTrendProvider / NaverTrendProvider 가 TrendScope 를 각자 방식으로 해석 (분석 로직은 공유하지 않는다)
```

- 프로필은 "무엇을 조사할지"만 정하고, "어떻게 찾을지"는 채널별 Provider가 정한다. 자세한 내용은 [CONTENT_PROFILE.md](./CONTENT_PROFILE.md)를 본다.
- NAVER 실제 데이터 (`NaverApiProvider`):
  - 데이터랩(검색 추이·급상승·시즌)
  - 블로그 검색(누적 문서 수)
  - 검색광고 API(월간 검색량·연관 키워드·경쟁, 선택) — 별도 연결 `naver-searchad` (v0.9.8)
  - 같은 조건은 6시간 동안 서버 메모리에 캐시한다.

### 5.2.2 사진·영상은 브라우저에서만 처리 (서버 저장 0)

| 기능 | 처리 | 서버로 가는 것 |
|------|------|----------------|
| 상세페이지 이미지 학습 | 조각 자르기·압축 (`lib/image-slicer.ts`) | AI 가 읽을 조각 (저장 안 함) |
| 블로그 제품 사진 | 가로 1080px·JPEG 압축·비율 자르기 (`lib/photo-process.ts`), ZIP (`lib/zip.ts`) | 사진 설명 텍스트만. AI 설명 버튼을 누르면 512px 미리보기 (저장 안 함) |
| 샤오홍슈 영상 다운로드 | 서버는 영상 주소만 조회 → 브라우저가 xhscdn 에서 직접 받기 → ffmpeg.wasm 소리 제거 (`lib/xhs-download.ts`) | 노트 링크 (영상 파일은 서버를 지나가지 않음) |
| 영상 음성 제거 | ffmpeg.wasm `-map 0:v -c copy -an` (`lib/video-mute.ts`) | 없음 (엔진은 unpkg CDN 에서 한 번 받아 캐시) |

파일 저장 비용을 쓰지 않는다. 그래서 사진·영상은 새로고침하면 사라지고, 결과는 ZIP·다운로드로 받는다.

### 5.2.3 부하·장애 대비

사용자별 1분 호출 한도, 외부 결과 캐시, CDN 예비 경로, AI 제한 시간은 [OPERATIONS.md](./OPERATIONS.md) 를 본다.

### 5.3 API 연결 (BYOK)

```
[Client] ApiConnectionCard  — 입력한 Key는 컴포넌트 state에만 잠시 있고, 전송 후 즉시 비운다
   │ PUT /api/connections/openai { credentials: { apiKey } }   (HTTPS)
   ▼
[Service] connectionService.connect()
   ├─ encrypt(JSON.stringify(credentials))  → AES-256-GCM (키: ENCRYPTION_KEY 환경변수)
   ├─ repo.connections.upsert({ provider, encryptedCredentials, maskedHint: "sk-…ab12", status })
   └─ return ApiConnectionPublic   ← 암호문, 평문 둘 다 포함하지 않는 공개용 DTO
```

### 5.x 학습 루프 (v0.9.18)

```
결과 화면: 👍/👎 · 직접 수정 · 후보 체크 · ★ · 업로드 완료
   → API 응답 → after(): learningService.maybeUpdate(featureId)
        새 신호 ≥ 10 → 기존 프로필 + 신호 요약 → getAIProvider().generateStructured(JSON Schema) → sanitize → learning_profiles v+1
생성: buildGenerationContext() → 학습 프로필 Insight(≤1,500자) + 좋은 예시 요약 → 프롬프트 → 기본 AI
```

## 6. 렌더링 전략

| 화면 | 방식 | 이유 |
|------|------|------|
| 메인, 채널 허브, 설정 허브 | Server Component | Registry 데이터만 쓰는 정적 화면 |
| 기능 화면 (트렌드, 생성, 라이브러리 …) | 페이지는 Server, 본문은 `features/*` Client | 필터와 폼 상태, API 호출이 필요하다 |
| 사이드바 | Client | `usePathname()`으로 활성 메뉴를 표시한다 |

URL 쿼리(`?productId=`)로 받는 값은 페이지(Server)에서 `await searchParams`로 읽어 props로 넘긴다. Client에서 `useSearchParams`를 쓰지 않으므로 Suspense 경계가 필요 없다.

## 7. 확장 방식 요약

| 하고 싶은 것 | 손댈 곳 |
|--------------|---------|
| 새 채널 (예: Instagram) | `lib/registry/channels.ts` + `app/instagram/page.tsx` (`<ChannelHub>` 3줄) |
| 새 생성형 기능 | Registry 항목 + Generator Config + Prompt 템플릿 + `app/.../page.tsx` |
| 새 조회형 기능 | Registry 항목 + `features/<name>/` + 필요하면 Provider 메서드와 API route |
| 새 AI 모델 | `lib/server/providers/ai/<name>-provider.ts` + registry 분기 |
| 다른 DB | `lib/server/repositories/` 아래 새 구현 + `getRepositories()` 분기 |
| 새 메뉴의 등급 권한 | Registry `defaultTiers` + 페이지를 `FeaturePage`로 감싸기 |
| 디자인 변경 | `app/globals.css`의 `@theme` 토큰 (컴포넌트 수정 없이 반영) |

자세한 절차는 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)를 본다.

## 8. 재사용 가능한 아키텍처 템플릿 (다른 프로젝트용)

이 프로젝트의 구조는 "여러 채널 × 여러 자동화 기능 × AI 생성"형 서비스 전반에 그대로 쓸 수 있다.

1. **Registry 우선**: 메뉴, 카드, 헤더를 하드코딩하지 말고 `channels`/`features` 데이터에서 만든다.
2. **3단계 정보 구조**: 1차(그룹) → 2차(기능 카드) → 3차(실행). 메인 화면에는 그룹만 노출한다.
3. **설정 기반 생성기**: 입력 필드와 출력 섹션 스키마만 다른 생성 기능은 컴포넌트 하나로 처리한다.
4. **Provider 인터페이스 + Mock 우선**: 외부 API 없이 전체 UX를 먼저 완성하고, 구현체만 교체한다.
5. **Memory → Context → Prompt(버전) → Provider → 이력 저장**: AI 호출의 표준 파이프라인으로 삼는다.
6. **서버 전용 경계**: `lib/server` + `server-only`로 비밀정보 유출을 구조적으로 막는다.

## 상품 상세페이지 수집: Bright Data (v0.9.36)

`ProductPageCollector` interface (trigger / progress / result) → `BrightDataCollector` / 데모 `MockBrightDataCollector` (`getProductPageCollector()`).
`productUrlLearning` 이 로컬 URL 판별 → 기존 제품 확인 → Trigger 1회 → 상태 확인 → 정리(`normalizeBrightDataRecord`) → 기존 `productAnalyzer` 로 이어 준다.
제품 라이브러리·AI 분석·저장 구조는 그대로. 자세한 내용은 [PRODUCT_DATA_COLLECTION.md](./PRODUCT_DATA_COLLECTION.md).

## 영상 소싱: 샤오홍슈·도우인 (v0.9.30)

공통 TikHub 클라이언트(`providers/tikhub/client.ts`) 위에 `XiaohongshuSearchProvider`·`DouyinProvider` 가 있고, `social-search.ts` 가
한국어 변환(기본 AI 1회) → 플랫폼별 검색어 순서(1순위 → 보조 → 영어) → 오류 분리 → 유사 표시를 맡는다. 화면은 공통 모델 `SocialVideoItem` 만 쓰고,
가져오기·다운로드는 기존 `videoService.importMany()`·`/api/videos/resolve` 를 그대로 쓴다. 자세한 내용은 [SOCIAL_VIDEO_SOURCING.md](./SOCIAL_VIDEO_SOURCING.md).

## 샤오홍슈 영상 검색 (v0.9.29)

`XiaohongshuSearchProvider` (lib/server/providers/xiaohongshu) → TikHub 구현 / 데모 Mock. 서비스 `xhs-search.ts` 가 기간·페이지·캐시를 맡고,
가져오기는 기존 `videoService.importMany()` 를 그대로 쓴다. 검색 결과는 저장하지 않는다. 자세한 내용은 [XIAOHONGSHU_SEARCH.md](./XIAOHONGSHU_SEARCH.md).
