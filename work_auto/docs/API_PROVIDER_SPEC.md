# API PROVIDER SPEC

> 외부 API(AI, 트렌드, 상품 수집)는 **반드시 Provider 계층을 통해서만** 호출한다.
> 코드 위치: `lib/server/providers/`

## 1. 왜 Provider 계층인가

| 문제 | Provider 계층 없이 | Provider 계층으로 |
|------|-------------------|-------------------|
| AI 모델 교체 | 기능 7개 코드를 전부 고친다 | `ai/<name>-provider.ts` 하나 추가 + registry 분기 하나 |
| 외부 API 없이 개발 | 키가 없으면 화면을 볼 수 없다 | Mock 구현으로 전체 UX를 확인한다 |
| 비용, 오류, 로깅 | 기능마다 제각각이다 | Provider 한 곳에서 처리한다 |
| 키 보안 | 키가 여러 곳으로 흩어진다 | Registry만 복호화된 키를 다룬다 |

## 2. 인터페이스 (`providers/types.ts`)

```ts
interface BaseProvider {
  readonly id: string;              // 생성 이력에 기록되는 구현체 ID
  readonly label: string;
  testConnection(): Promise<ConnectionTestResult>;
}

interface AIProvider extends BaseProvider {
  readonly kind: "ai";
  readonly model: string;
  generateText(req: TextGenerationRequest): Promise<TextGenerationResult>;
  generateStructured<T>(req: StructuredGenerationRequest): Promise<StructuredGenerationResult<T>>;
}
// StructuredGenerationRequest = { task, messages[], outputKeys[], variables, temperature?, maxTokens? }
//  - messages: 실제 AI가 보는 프롬프트 (system + user)
//  - variables: 프롬프트를 만든 구조화 데이터 (Mock이 결정적인 출력을 만들 때, 그리고 로깅에 사용)

interface YouTubeTrendProvider extends BaseProvider {
  readonly kind: "youtube-trend";
  searchTrends(q: YouTubeTrendQuery): Promise<YouTubeTrendItem[]>;
  getVideoMeta(url: string): Promise<VideoMeta>;
}

interface NaverTrendProvider extends BaseProvider {
  readonly kind: "naver-trend";
  getInsight(q: NaverTrendQuery): Promise<NaverTrendInsight>;
}
type TrendProvider = YouTubeTrendProvider | NaverTrendProvider;

interface ProductDataCollector {          // 수집만 한다. 분석하지 않는다.
  readonly id: string;
  supports(source: ProductSourceInput): boolean;
  collect(source: ProductSourceInput): Promise<RawProductData>;
}
```

`ProductDataProvider` 역할은 **Collector(수집) + Analyzer(분석, AIProvider 사용)** 둘로 나눴다.
수집처가 늘어나도 분석 코드는 그대로 쓰고, AI 모델이 바뀌어도 수집 코드는 그대로 쓴다.

## 3. 구현체 현황

| 영역 | 구현체 | 파일 | 상태 |
|------|--------|------|------|
| AI | MockAIProvider | `ai/mock-ai-provider.ts`, `ai/mock-writer.ts` | ✅ 동작 (결정적 출력, Context 반영) |
| AI | ClaudeProvider | `ai/claude-provider.ts` | ✅ 동작 (기본 `claude-sonnet-5-5`, 구조화 출력, 이미지 입력, 거절 시 fallback) |
| AI | OpenAIProvider | `ai/openai-provider.ts` | ✅ 동작 (fetch, Chat Completions JSON mode, 이미지 입력) |
| YouTube | MockYouTubeTrendProvider | `trends/mock-youtube-provider.ts` | ✅ 동작 |
| YouTube | YouTubeDataApiProvider | `trends/youtube-data-api-provider.ts` | ✅ 구현 (트렌드, 영상 메타데이터, 연결 테스트). 서버 메모리 6시간 캐시 |
| NAVER | MockNaverTrendProvider | `trends/mock-naver-provider.ts` | ✅ 동작 |
| NAVER | NaverApiProvider | `trends/naver-api-provider.ts` | ⚠️ testConnection만 실제 동작, 조회는 501 |
| 상품 | MockUrlCollector | `product/collectors.ts` | ✅ Mock (URL → 카탈로그) |
| 상품 | MockImageCollector | 〃 | ✅ Mock (OCR 대체) |
| 상품 | TextCollector | 〃 | ✅ **실제 동작** ("키: 값" 줄은 스펙으로 파싱) |

## 4. Provider 선택 규칙 (`providers/registry.ts`)

```
PROVIDER_MODE=mock (기본)  → 항상 Mock
PROVIDER_MODE=live         → 사용자가 해당 Provider를 연결했으면 실제 구현, 아니면 Mock
```

```ts
const ai = await getAIProvider();               // Service는 이것만 호출한다
const yt = await getYouTubeTrendProvider();
const nv = await getNaverTrendProvider();
const collector = getProductCollector(source);  // supports()가 true인 첫 번째 구현체
```

## 5. Provider별 명세

### 5.1 OpenAI
| 항목 | 내용 |
|------|------|
| 용도 | 글쓰기, 제목·대본·설명, 키워드 해석, 이미지 분석(Vision), 제품 분석 |
| 인증 | `Authorization: Bearer sk-…` |
| 자격증명 | `{ apiKey }`. 형식 검증: `sk-`로 시작 |
| 테스트 | `GET /v1/models` |
| 생성 | `POST /v1/chat/completions`, `response_format: {type: "json_object"}` |
| 모델 | 환경변수 `OPENAI_MODEL` (기본 `gpt-4o-mini`) |
| 발급 | https://platform.openai.com/api-keys |

### 5.2 YouTube Data API v3
| 항목 | 내용 |
|------|------|
| 용도 | 트렌드 영상 수집, 영상 URL 메타데이터 |
| 인증 | `?key=` API Key |
| 자격증명 | `{ apiKey }` |
| 테스트 | `GET /videoCategories?part=snippet&regionCode=KR` (1 unit) |
| 트렌드 구현 순서 | ① `search.list`(type=video, publishedAfter, q, regionCode=KR, videoDuration) **100 units** → ② `videos.list`(statistics, contentDetails; 최대 50개) 1 unit → ③ `channels.list`(statistics) 1 unit → ④ `calcTrendScore()` → `YouTubeTrendItem` |
| 할당량 | 기본 10,000 units/일. `search.list`가 비싸므로 (카테고리, 키워드, 기간) 조합을 6시간 캐시한다 |
| 영상 메타 | URL에서 videoId 추출 → `videos.list` |
| Shorts 판별 | 길이 180초 이하 (2024년 10월부터 Shorts 최대 3분) |
| 오류 안내 | quotaExceeded → 할당량 소진 안내(429), keyInvalid → 키 확인 안내, 403 → API 사용 설정·키 제한 확인 안내. 오류 메시지에 키를 넣지 않는다 |
| 발급 | Google Cloud Console → YouTube Data API v3 사용 설정 → 사용자 인증 정보 → **API 키** (OAuth 클라이언트 아님). 키 제한: YouTube Data API v3 |
| 참고 | YouTube Analytics / Reporting API 는 "내 채널" 데이터라 API 키로 호출할 수 없고 OAuth 로그인이 필요하다 (성과 데이터 연동 단계에서 사용) |

### 5.3 NAVER Open API
| 항목 | 내용 |
|------|------|
| 용도 | 검색어 트렌드, 쇼핑 인사이트, 검색 결과 |
| 인증 | 헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret` |
| 자격증명 | `{ clientId, clientSecret }` |
| 테스트 | `GET /v1/search/blog.json?query=test&display=1` |
| 구현 순서 | ① DataLab 검색어 트렌드 `POST /v1/datalab/search` → `searchTrend` ② 쇼핑인사이트 `POST /v1/datalab/shopping/categories` → 카테고리 급상승 ③ 연관 키워드·검색량은 **검색광고 API**(별도 키: API Key, Secret, Customer ID)가 필요하다 ④ `contentIdeas`는 Service에서 AIProvider로 해석한다 (Provider끼리 직접 호출하지 않는다) |
| 발급 | https://developers.naver.com/apps → 애플리케이션 등록 → 데이터랩(검색어트렌드), 검색 API 선택 |

## 6. API 연결 방법 (사용자 관점)

1. 설정 → **API 연결 센터** (`/settings/api`)
2. Provider 카드에 키 입력 → **[연결하기]** → 서버에서 암호화 저장, 화면에는 `sk-…abcd`만 표시
3. **[테스트]** → Mock 모드면 저장·복호화만 확인하고, Live 모드면 실제 API를 호출한다
4. 실제 호출을 쓰려면 서버 환경변수 `PROVIDER_MODE=live`, `ENCRYPTION_KEY`를 설정한다

## 7. API Key 보안 원칙 (반드시 지킨다)

| # | 원칙 | 구현 위치 |
|---|------|-----------|
| 1 | 키는 **서버로만** 전송한다 (HTTPS) | `ApiConnectionCard` → `PUT /api/connections/:provider` |
| 2 | 브라우저 저장소(localStorage, sessionStorage, cookie)에 저장하지 않는다 | 입력값은 컴포넌트 state에만 두고, 전송 후 즉시 비운다 |
| 3 | 서버에서 **AES-256-GCM으로 암호화**해 저장한다 | `lib/server/security/crypto.ts` |
| 4 | 암호화 키는 환경변수 `ENCRYPTION_KEY`(32바이트 base64)로 주입한다. 운영에서 없으면 서버가 시작 시 에러를 낸다 | `getKey()` |
| 5 | 응답에는 **마스킹 값만** 담는다. 암호문도 내보내지 않는다 | `toPublic()` → `ApiConnectionPublic` |
| 6 | 복호화는 Provider를 만드는 순간에만 한다 | `registry.ts loadCredentials()` |
| 7 | 키를 로그에 남기지 않는다. 오류 메시지에 키를 넣지 않는다 | Provider 구현 규칙 |
| 8 | `lib/server/**`는 `server-only`라서 클라이언트 번들에 들어가지 않는다 | 모든 서버 파일 첫 줄 |
| 9 | (V2) 키 회전: `ENCRYPTION_KEY` 버전 접두어를 붙여 재암호화 배치를 돌린다 | NEXT_STEPS |
| 10 | (V2) 사용자별 사용량·비용을 기록하고 상한을 둔다 | NEXT_STEPS |

생성 키 예: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

## 8. 새 AI Provider 추가 방법 (Claude / Gemini)

### 8.1 공통 절차
1. `lib/types/common.ts`의 `ProviderId`에 추가 (`"claude"` 등)
2. `lib/types/connection.ts`의 `ProviderCredentialMap`에 자격증명 형태 추가
3. `lib/server/providers/ai/<name>-provider.ts`에 `AIProvider` 구현
4. `providers/registry.ts`의 `getAIProvider()`와 `createProviderForTest()`에 분기 추가
   (예: 사용자가 고른 "기본 AI" 설정을 보고 결정)
5. `services/connections.ts`의 `PROVIDER_IDS`와 `validate()`에 추가
6. `features/api-center/ApiCenter.tsx`의 `PROVIDERS`에 카드 메타 추가
7. 이 문서의 3장과 5장, FEATURE_REGISTRY의 "필요 API"를 갱신

**기능 코드(Service, 화면)는 수정하지 않는다.** 그게 Provider 계층의 목적이다.

### 8.2 Claude (Anthropic) 예시

- SDK: `npm install @anthropic-ai/sdk`
- 모델: `claude-opus-5-5` (기본). 더 빠르고 저렴한 경로가 필요하면 `claude-sonnet-5-5`
- 구조화 출력: `output_config.format`에 JSON Schema를 넘긴다
- 주의할 차이점:
  - `system`은 messages 배열이 아니라 **최상위 파라미터**다
  - Claude Opus 5.5는 `temperature`를 받지 않으므로 보내지 않는다. 품질과 속도는 `output_config.effort`(`low`~`max`, 이 모델의 기본은 `medium`)로 조절한다
  - `stop_reason === "refusal"`을 먼저 확인하고 `content`를 읽는다

```ts
// lib/server/providers/ai/claude-provider.ts (예시)
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../../http";
import type { AIProvider, StructuredGenerationRequest, StructuredGenerationResult,
  TextGenerationRequest, TextGenerationResult } from "../types";

export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly kind = "ai" as const;
  readonly label = "Claude";
  private readonly client: Anthropic;

  constructor(apiKey: string, readonly model = "claude-opus-5-5") {
    this.client = new Anthropic({ apiKey });
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      await this.client.models.retrieve(this.model);
      return { ok: true, message: "Claude API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? e.status : undefined;
      return { ok: false, message: `Claude 연결 실패${status ? ` (HTTP ${status})` : ""}`, testedAt, mock: false };
    }
  }

  private split(messages: TextGenerationRequest["messages"]) {
    return {
      system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    };
  }

  async generateText(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const res = await this.client.messages.create({
      model: this.model, max_tokens: req.maxTokens ?? 16000, ...this.split(req.messages),
    });
    if (res.stop_reason === "refusal") throw new AppError("AI_REFUSED", "AI 가 요청을 거절했습니다.", 422);
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text, provider: this.id, model: this.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  }

  async generateStructured<T extends Record<string, unknown>>(
    req: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      ...this.split(req.messages),
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: buildSchema(req.outputKeys) },
      },
    });
    if (res.stop_reason === "refusal") throw new AppError("AI_REFUSED", "AI 가 요청을 거절했습니다.", 422);
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { data: JSON.parse(text) as T, provider: this.id, model: this.model,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  }
}

// 콘텐츠 생성용: 각 key 는 문자열 또는 문자열 배열.
// 권장 개선: StructuredGenerationRequest 에 jsonSchema 를 추가해
//  - 콘텐츠 생성은 Generator Config 의 outputs(list/tags → array, text/longtext → string)로,
//  - 제품 분석(task "product-analysis")은 ProductAnalysisContent 구조 그대로 중첩 스키마를 만들어 넘긴다.
function buildSchema(keys: string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((k) => [k, {
      anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    }])),
    required: keys,
    additionalProperties: false,
  };
}
```

> 운영 팁: Claude Opus 5.5는 안전 분류기 때문에 드물게 `refusal`로 끝날 수 있다. 서비스화할 때는 Anthropic의 서버 측 fallback 옵션(`fallbacks`)을 켜거나, 위처럼 refusal을 사용자 친화적 오류로 바꾼다.

### 8.3 Gemini 예시 (요지)
- SDK `@google/genai`, 자격증명 `{ apiKey }`
- `systemInstruction` + `contents`로 변환하고, `responseMimeType: "application/json"` + `responseSchema`로 JSON을 받는다
- 나머지 절차는 8.1과 같다

## 9. 새 트렌드 / 수집 Provider 추가

- 새 트렌드 소스(예: Instagram): `types.ts`에 인터페이스(`InstagramTrendProvider`) 추가 → Mock 구현 → registry getter → Service 메서드 → API route
- 새 쇼핑몰 Collector: `ProductDataCollector` 구현 → `registry.ts`의 `COLLECTORS` 배열 **앞쪽**에 추가 (예: `supports = url에 coupang.com 포함`). 분석 코드는 건드리지 않는다
- 스크래핑은 대상 사이트의 이용약관과 robots 정책을 확인한다. 가능하면 공식 API나 파트너 API를 먼저 쓴다
