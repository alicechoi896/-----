import type {
  ApiConnectionPublic,
  ApiResult,
  GeneratedContent,
  GenerateContentRequest,
  NaverTrendInsight,
  PerformanceMetric,
  Product,
  ProductAnalysisDraft,
  ProductDetail,
  ProductSourceInput,
  ProductUpdateInput,
  ProviderId,
  ReferenceVideo,
  TrendOption,
  UserFeedback,
  UserFeedbackInput,
  UserStyle,
  UserStyleInput,
  YouTubeTrendItem,
  YouTubeTrendQuery,
} from "@/lib/types";

/**
 * 클라이언트 → 서버 API 호출은 모두 이 파일을 거친다.
 * 컴포넌트에서 fetch("/api/...") 를 직접 쓰지 않는다 (경로·타입·오류 처리를 한 곳에서 관리).
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK", "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.");
  }
  const body = (await res.json().catch(() => null)) as ApiResult<T> | null;
  if (!body) throw new ApiError("BAD_RESPONSE", "서버 응답을 해석할 수 없습니다.");
  if (!body.ok) throw new ApiError(body.error.code, body.error.message);
  return body.data;
}

const json = (data: unknown) => JSON.stringify(data);

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  trends: {
    youtube: (q: YouTubeTrendQuery) =>
      request<{ items: YouTubeTrendItem[]; provider: string }>(
        `/api/trends/youtube${qs({ category: q.category, keyword: q.keyword, period: q.periodDays, format: q.format, sort: q.sort })}`,
      ),
    naver: (q: { scope: "clip" | "blog"; category?: string; keyword?: string; periodDays: number }) =>
      request<{ insight: NaverTrendInsight; provider: string }>(
        `/api/trends/naver${qs({ scope: q.scope, category: q.category, keyword: q.keyword, period: q.periodDays })}`,
      ),
    options: (source: "youtube" | "naver") => request<TrendOption[]>(`/api/trends/options${qs({ source })}`),
  },

  products: {
    list: () => request<Product[]>("/api/products"),
    get: (id: string) => request<ProductDetail>(`/api/products/${id}`),
    analyze: (source: ProductSourceInput) =>
      request<ProductAnalysisDraft>("/api/products/analyze", { method: "POST", body: json({ source }) }),
    save: (draft: ProductAnalysisDraft) => request<Product>("/api/products", { method: "POST", body: json(draft) }),
    update: (id: string, input: ProductUpdateInput) =>
      request<ProductDetail>(`/api/products/${id}`, { method: "PATCH", body: json(input) }),
    remove: (id: string) => request<{ id: string }>(`/api/products/${id}`, { method: "DELETE" }),
  },

  contents: {
    list: (filter: { featureId?: string; productId?: string } = {}) =>
      request<GeneratedContent[]>(`/api/contents${qs(filter)}`),
    generate: (req: GenerateContentRequest) =>
      request<GeneratedContent>("/api/contents/generate", { method: "POST", body: json(req) }),
    setExemplar: (id: string, isExemplar: boolean) =>
      request<GeneratedContent>(`/api/contents/${id}`, { method: "PATCH", body: json({ isExemplar }) }),
  },

  feedback: {
    list: () => request<UserFeedback[]>("/api/feedback"),
    add: (input: UserFeedbackInput) => request<UserFeedback>("/api/feedback", { method: "POST", body: json(input) }),
  },

  styles: {
    list: () => request<UserStyle[]>("/api/styles"),
    create: (input: UserStyleInput) => request<UserStyle>("/api/styles", { method: "POST", body: json(input) }),
    setDefault: (id: string) => request<UserStyle>(`/api/styles/${id}`, { method: "PATCH" }),
    remove: (id: string) => request<{ id: string }>(`/api/styles/${id}`, { method: "DELETE" }),
  },

  memory: {
    overview: () =>
      request<{ counts: Record<"products" | "styles" | "contents" | "exemplars" | "feedback" | "performance", number> }>(
        "/api/memory",
      ),
    performance: () => request<(PerformanceMetric & { headline: string })[]>("/api/performance"),
  },

  connections: {
    list: () => request<ApiConnectionPublic[]>("/api/connections"),
    connect: (provider: ProviderId, credentials: Record<string, string>) =>
      request<ApiConnectionPublic>(`/api/connections/${provider}`, { method: "PUT", body: json({ credentials }) }),
    disconnect: (provider: ProviderId) =>
      request<ApiConnectionPublic>(`/api/connections/${provider}`, { method: "DELETE" }),
    test: (provider: ProviderId) => request<ApiConnectionPublic>(`/api/connections/${provider}/test`, { method: "POST" }),
  },

  videos: {
    list: () => request<ReferenceVideo[]>("/api/videos"),
    import: (url: string, note?: string) => request<ReferenceVideo>("/api/videos", { method: "POST", body: json({ url, note }) }),
    remove: (id: string) => request<{ id: string }>(`/api/videos/${id}`, { method: "DELETE" }),
  },
};
