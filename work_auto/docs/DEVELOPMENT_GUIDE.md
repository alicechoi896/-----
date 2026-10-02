# DEVELOPMENT GUIDE: 이어서 개발하는 사람을 위한 안내

> Claude Code 또는 다른 개발자가 이 프로젝트를 이어받을 때 **가장 먼저 읽는 문서**다.
> 읽는 순서: README → 이 문서 → [ARCHITECTURE](./ARCHITECTURE.md) → [FEATURE_REGISTRY](./FEATURE_REGISTRY.md) → 필요한 영역의 문서

## 0. 시작 전 체크

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (next typegen 포함)
npm run build        # 프로덕션 빌드
```

- Next.js **16**이다. `params`와 `searchParams`는 **Promise**이므로 `await`해야 한다. 타입은 전역 헬퍼 `PageProps<"/route">`, `RouteContext<"/api/...">`를 쓴다. 학습 데이터와 다른 API가 있을 수 있으니 `node_modules/next/dist/docs/`를 확인한다 (AGENTS.md).
- Tailwind **v4**다. 설정 파일이 없고, 토큰은 `app/globals.css`의 `@theme`에 있다.

## 1. 새 채널 추가 (예: Instagram)

1. `lib/types/common.ts`: `ChannelId`에 `"instagram"` 추가
2. `lib/registry/channels.ts`: `CHANNELS`에 항목 추가 (name, hubTitle, description, hubDescription, href, icon, accent, showOnHome)
3. (선택) 새 포인트 컬러: `globals.css`에 `--color-ch-insta`, `--color-ch-insta-soft` → `lib/registry/types.ts`의 `AccentColor` → `components/ui/IconChip.tsx`의 `ACCENTS`
4. `app/(app)/instagram/page.tsx`:
   ```tsx
   import { ChannelHub } from "@/components/shared/ChannelHub";
   import { getChannel } from "@/lib/registry";
   export const metadata = { title: getChannel("instagram").hubTitle };
   export default function Page() { return <ChannelHub channelId="instagram" />; }
   ```
5. 메인 카드, 사이드바, 브레드크럼, 권한 관리 표는 **자동으로** 나타난다
6. 문서: FEATURE_REGISTRY 1장, ROUTES 2장

## 2. 새 FeatureCard (기능) 추가

1. `lib/registry/features.ts`의 `FEATURES`에 `FeatureDef` 추가
   - `id`는 전역 고유이고 **나중에 바꾸지 않는다** (생성 이력, 프롬프트, Config의 키다)
   - 아직 화면이 없으면 `status: "planned"` → 카드가 비활성으로 보인다
   - **`defaultTiers` 필수**: 기본으로 쓸 수 있는 등급 (`ALL` / `GOLD_UP` / `VIP_ONLY`). 관리자는 항상 허용 ([AUTH_AND_PERMISSIONS.md](./AUTH_AND_PERMISSIONS.md))
2. 채널 허브 카드, 사이드바 하위 메뉴, 사이트 관리 → 권한 관리 표에 자동으로 나타난다
3. 화면을 만들면 `status`를 `mock` 또는 `live`로 바꾼다
4. FEATURE_REGISTRY.md에 한 줄 추가

## 3. 새 페이지 추가

```tsx
// app/(app)/<channel>/<feature>/page.tsx: 페이지는 얇게
import { FeaturePage } from "@/components/layout/FeaturePage";
import { MyFeature } from "@/features/my-feature/MyFeature";
import { getFeature } from "@/lib/registry";

const FEATURE_ID = "my-feature";
export const metadata = { title: getFeature(FEATURE_ID).title };

export default function Page() {
  return (
    <FeaturePage featureId={FEATURE_ID} width="wide">
      <MyFeature />
    </FeaturePage>
  );
}
```

- `FeaturePage`가 헤더와 **권한 확인**을 함께 한다. 권한이 없으면 안내 화면이 나오고 `MyFeature`는 실행되지 않는다
- 이 기능 전용 API를 만들면 Route Handler 첫 줄에 `await requireAccess("my-feature")`
- 관리자 전용 화면은 `AdminPage`, API는 `requireAdmin()`
- 화면 로직은 `features/my-feature/`에 Client Component로 둔다
- 서버 데이터는 `lib/api-client`에 함수를 추가하고 `useAsync`로 불러온다
- Loading / Empty / Error 세 상태를 모두 처리한다
- 쿼리로 초기값을 받으려면 페이지에서 `await searchParams` → props로 넘긴다 (`useSearchParams`를 쓰지 않는다)

## 4. 새 API Provider 추가

[API_PROVIDER_SPEC.md](./API_PROVIDER_SPEC.md) 8~9장을 따른다. 요약:
1. `ProviderId`, `ProviderCredentialMap` 타입
2. `lib/server/providers/<영역>/<name>-provider.ts`에서 인터페이스 구현 (`import "server-only"` 필수)
3. `providers/registry.ts`의 getter와 `createProviderForTest`
4. `services/connections.ts`의 `PROVIDER_IDS`, `validate()`
5. `features/api-center/ApiCenter.tsx`의 `PROVIDERS`

## 5. 새 AI 생성 기능 추가 (가장 자주 하는 작업)

예: "YouTube 썸네일 문구 만들기"

1. **Registry**: `features.ts`에 `{ id: "yt-thumbnail-text", channelId: "youtube", kind: "generator", ... }`
2. **Generator Config**: `lib/generators/configs.ts`
   ```ts
   "yt-thumbnail-text": {
     featureId: "yt-thumbnail-text",
     promptId: "youtube.thumbnail-text",
     submitLabel: "썸네일 문구 생성하기",
     productField: "productId",          // 제품을 쓰면 지정 → Product Memory 자동 주입
     headlineKey: "texts",
     fields: [F.product(false), F.keywords()],   // 공용 필드 재사용
     outputs: [{ key: "texts", label: "썸네일 문구", format: "list", count: 10 }],
   },
   ```
3. **Prompt**: `lib/server/ai/prompts/templates.ts`에 `contentTemplate("youtube.thumbnail-text", "설명", "작업 지시")`
4. **Mock 출력** (선택): `providers/ai/mock-writer.ts`의 `builders`에 `texts` key를 추가 (없으면 "(라벨 — Mock 출력)"이 나온다)
5. **Page**: `app/youtube/thumbnail-text/page.tsx` (기존 생성 페이지를 복사하고 FEATURE_ID만 변경)
6. **문서**: FEATURE_REGISTRY 2장, 3장

API, 저장, 이력, 피드백, Memory 주입, 결과 UI는 **추가 작업 없이** 동작한다.

새 입력 타입이 필요하면 `FieldType` → `DynamicField` 분기를 추가하고, 새 원격 선택지는 `RemoteSource` → `useRemoteOptions.LOADERS`에 추가한다.
새 출력 형식이 필요하면 `OutputFormat` → `ResultPanel`의 `OutputBlock` 분기 → `content-generation.ts` 정규화 순서로 추가한다.

## 6. 공통 컴포넌트 사용법

| 필요 | 쓸 것 | 비고 |
|------|------|------|
| 페이지 틀 | 기능 페이지는 `FeaturePage`(권한 확인 포함), 그 외 `PageContainer` + `PageHeader` | width `default`(1200) / `wide`(1440) |
| 제목 있는 블록 | `SectionCard` | `actions`, `footer`, `flush`(표용) |
| 버튼 | `Button`, `LinkButton`, `IconButton`, `SaveButton` | primary는 화면에 1개 |
| 입력 | `FormField` + `Input` / `Textarea` / `Select` / `SegmentedControl` | |
| 검색·필터 | `FilterBar` + `FilterItem` + `SearchInput` | |
| 표 | `DataTable` + `Column<T>[]` | 숫자 열은 `numeric` |
| 탭 | `Tabs` | 제어 컴포넌트 |
| 상태 | `LoadingState`, `EmptyState`, `ErrorState`, `Notice` | |
| 배지 | `StatusBadge`(상태), `Badge`(일반), `Tag`(키워드) | |
| 숫자 요약 | `StatTile` | |
| 차트 | `TrendLineChart` | 단일 시계열 |
| 복사 | `CopyButton` | 배열은 줄바꿈으로 합침 |
| 기능 카드 | `FeatureCard`, `ChannelCard`, `ChannelHub` | Registry 데이터를 그대로 받는다 |
| 제품 | `ProductCard`, `ProductThumb`, `ProductAnalysisView`, `CreateContentMenu` | |
| 생성 | `ContentGenerator`, `ResultPanel` | Generator Config 기반 |
| API 연결 | `ApiConnectionCard` | |

import는 `@/components/ui`(배럴)에서 한다. 상세 규격은 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)를 본다.

## 7. 저장소 (인메모리 / Supabase)

- Supabase 환경변수가 있으면 `supabase-store.ts`, 없으면 `memory-store.ts` (`getRepositories()`가 선택)
- 새 Entity 를 추가하면: `lib/types` 타입 → `Repositories`에 추가 → `memory-store`(StoreState, Seed) → `supabase-store`(테이블 이름) → `supabase/schema.sql`(테이블, RLS `own_rows`) 순서
- 컬럼 이름은 Entity 필드의 snake_case, 중첩 객체는 jsonb, 문자열 배열은 text[]
- 사용자 데이터 테이블에는 `user_id uuid default auth.uid()`와 RLS `own_rows` 정책을 꼭 둔다
- `list(filter)`는 RLS 로 걸러진 내 데이터를 가져온 뒤 함수로 거른다. 데이터가 많아지면 자주 쓰는 조회를 전용 메서드(SQL where)로 승격한다
- 설정 절차: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

## 8. 절대 하면 안 되는 구조 🚫

| 금지 | 이유 | 대신 |
|------|------|------|
| 컴포넌트나 Route에서 `fetch("https://api.openai.com…")`, SDK 직접 호출 | Provider 교체·Mock·보안이 깨진다 | `getAIProvider()` |
| 클라이언트 컴포넌트에서 `lib/server/**` import | 비밀정보가 번들에 들어간다 (`server-only`가 빌드를 막는다) | `lib/api-client` → API route |
| API Key를 localStorage, cookie, URL, 로그에 저장 | 유출된다 | 서버 암호화 저장 (`connectionService`) |
| 응답에 `encryptedCredentials`나 평문 키 포함 | 유출된다 | `ApiConnectionPublic` |
| 메뉴, 카드, 제목을 페이지에 하드코딩 | 기능이 늘면 불일치가 생긴다 | Registry |
| 생성 기능마다 폼·결과 UI를 새로 작성 | 30개가 되면 유지보수가 불가능하다 | Generator Config + `ContentGenerator` |
| AI를 Context 없이 호출 (`ai.generate("제목 써줘")`) | 품질이 흔들리고 Memory가 무의미해진다 | `buildGenerationContext()` → `renderContentPrompt()` |
| 생성할 때마다 상세페이지 재분석 | 비용, 속도, 일관성이 모두 나빠진다 | 저장된 `ProductAnalysis` |
| Collector 안에서 AI 분석, Analyzer 안에서 HTTP 수집 | 수집처나 모델을 바꿀 때 둘 다 깨진다 | Collector와 Analyzer 분리 |
| 프롬프트를 바꾸고 version을 그대로 두기 | 품질 비교와 재현이 불가능하다 | version과 changelog 갱신 |
| AI 원본 결과를 덮어쓰기 | 학습 데이터(원본 ↔ 수정본)가 사라진다 | 수정본은 별도 저장 |
| `gray-500`, `#xxxxxx` 색 하드코딩, 새 그림자·반경 값 | 디자인이 흩어진다 | 디자인 토큰 |
| 다크 배경을 기본으로 사용 | 디자인 원칙 위반 | 흰색 기반 |
| Feature `id` 변경 | 이력, Config, 프롬프트, **권한** 연결이 끊어진다 | 새 ID로 추가하고 이전 것은 planned/삭제 |
| 기능 페이지를 `FeaturePage` 없이 만들기 / 전용 API 에 `requireAccess` 빼기 | 등급 권한이 무시된다 | `FeaturePage`, `requireAccess` |
| 앱에 Supabase service_role 키 넣기 | 유출되면 RLS 를 모두 우회한다 | anon key + 로그인 세션 + RLS(`is_admin()`) |
| 상태를 바꾸는 관리 기능에서 활동 기록 생략 | 사고가 나도 원인을 알 수 없다 | `auditService.log(session, {...})` |
| SQL 파일을 JS `replace()` 로 고치기 | 치환 문자열의 `$$` 가 `$` 로 바뀌어 함수 정의가 깨진다 | 직접 편집하거나 `split().join()` |
| 실제 경험 없이 "직접 써봤다"는 문구 생성 허용 | 허위·과장 광고 위험 | 정직성 가드레일 유지 |

## 9. 코드 규칙

- 서버 파일 첫 줄: `import "server-only";`
- Route Handler는 `handle(() => service.method(...))` 한 줄로 쓰고, 오류는 `AppError(code, message, status)`로 던진다
- 사용자에게 보이는 문구는 한국어(합니다체)로 쓴다
- 시간은 ISO 문자열로 저장하고, 표시는 `formatDate` / `formatRelative`로 한다
- ID는 `createId("prefix")`로 만든다 (prd_, pan_, cnt_, fb_, sty_, vid_, conn_)
- Mock 데이터는 `seededNumber`로 결정적으로 만든다 (새로고침마다 바뀌지 않게)
- 변경 후 `npm run lint && npm run typecheck && npm run build`가 통과해야 한다

## 10. 다른 프로젝트에 이 구조를 복제하는 순서

1. `app/globals.css`(@theme), `components/ui`, `components/layout`을 복사한다
2. `lib/registry`를 새 서비스의 그룹·기능으로 다시 쓴다
3. `lib/types`를 도메인에 맞게 정의한다
4. `lib/server/{http, repositories, security, providers/types.ts, providers/registry.ts}` 뼈대를 복사한다
5. 생성형 기능이 있으면 `lib/generators` + `features/content-generator` + `lib/server/ai`를 복사한다
6. docs 폴더 구조(PRD, ARCHITECTURE, DESIGN_SYSTEM, FEATURE_REGISTRY, …)를 그대로 쓴다
