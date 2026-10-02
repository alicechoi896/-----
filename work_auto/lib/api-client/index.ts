import type { PermissionRow } from "@/lib/permissions";
import type {
  ApiConnectionPublic,
  ChannelId,
  ContentProfile,
  ContentProfileInput,
  AuditLog,
  MemberRole,
  MemberTier,
  UserProfile,
  UserSettings,
  UserSettingsInput,
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
  SavedFilter,
  SavedTrend,
  YouTubeTopicSuggestion,
  YouTubeTrendItem,
  YouTubeTrendPage,
  YouTubeTrendQuery,
  YouTubeVideoAnalysis,
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

/**
 * 조회(GET) 결과 짧은 캐시 (브라우저 메모리, 탭 단위).
 * - 같은 주소를 30초 안에 다시 부르면 서버에 가지 않고 바로 돌려준다 → 화면 이동이 빨라진다
 * - 동시에 같은 요청이 여러 번 나가면 하나로 합친다
 * - 저장·수정·삭제(GET 이 아닌 요청)가 성공하면 캐시를 모두 비워 오래된 데이터를 보여주지 않는다
 * - 실패한 응답은 저장하지 않는다
 */
const GET_CACHE_TTL_MS = 30_000;
const getCache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function clearApiCache() {
  getCache.clear();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method === "GET";
  if (!isGet) {
    const result = await send<T>(path, init);
    clearApiCache();
    return result;
  }
  const hit = getCache.get(path);
  if (hit && Date.now() - hit.at < GET_CACHE_TTL_MS) return hit.promise as Promise<T>;
  const promise = send<T>(path, init);
  getCache.set(path, { at: Date.now(), promise });
  promise.catch(() => getCache.delete(path));
  return promise;
}

async function send<T>(path: string, init?: RequestInit): Promise<T> {
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
    /** 한 페이지(최대 50개 조회). 이어서 부를 때는 q.pageToken 에 nextPageToken 을 넣는다 */
    youtube: ({ scope: _scope, ...q }: YouTubeTrendQuery) => {
      void _scope; // 조사 범위는 서버가 profileId 로 풀어 넣는다
      return request<YouTubeTrendPage & { query: YouTubeTrendQuery; provider: string }>(`/api/trends/youtube${qs({ ...q })}`);
    },
    analyzeVideo: (video: YouTubeTrendItem) =>
      request<YouTubeVideoAnalysis & { provider: string }>("/api/trends/youtube/analyze", { method: "POST", body: json({ video }) }),
    suggestTopics: (videos: YouTubeTrendItem[], keywords: string[]) =>
      request<{ topics: YouTubeTopicSuggestion[]; provider: string }>("/api/trends/youtube/topics", {
        method: "POST",
        body: json({ videos, keywords }),
      }),
    filters: {
      list: () => request<SavedFilter[]>("/api/trends/youtube/filters"),
      save: (input: { name: string; params: Omit<YouTubeTrendQuery, "pageToken">; isDefault?: boolean }) =>
        request<SavedFilter>("/api/trends/youtube/filters", { method: "POST", body: json(input) }),
      update: (id: string, patch: { name?: string; isDefault?: boolean }) =>
        request<SavedFilter>(`/api/trends/youtube/filters/${id}`, { method: "PATCH", body: json(patch) }),
      remove: (id: string) => request<{ id: string }>(`/api/trends/youtube/filters/${id}`, { method: "DELETE" }),
    },
    saved: {
      list: () => request<SavedTrend[]>("/api/trends/youtube/saved"),
      add: (item: YouTubeTrendItem) => request<SavedTrend>("/api/trends/youtube/saved", { method: "POST", body: json({ item }) }),
      remove: (id: string) => request<{ id: string }>(`/api/trends/youtube/saved/${id}`, { method: "DELETE" }),
    },
    naver: (q: { scope: "clip" | "blog"; category?: string; keyword?: string; periodDays: number; profileId?: string }) =>
      request<{ insight: NaverTrendInsight; provider: string }>(
        `/api/trends/naver${qs({ scope: q.scope, category: q.category, keyword: q.keyword, period: q.periodDays, profileId: q.profileId })}`,
      ),
    options: (source: "youtube" | "naver") => request<TrendOption[]>(`/api/trends/options${qs({ source })}`),
  },

  products: {
    list: () => request<Product[]>("/api/products"),
    get: (id: string) => request<ProductDetail>(`/api/products/${id}`),
    /** 상세 이미지 조각 → 텍스트 (AI Vision). 이미지는 서버에 저장되지 않는다 */
    extractImages: (images: { mediaType: string; data: string }[], partLabel?: string) =>
      request<{ text: string; provider: string }>("/api/products/extract-images", { method: "POST", body: json({ images, partLabel }) }),
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
    update: (id: string, input: UserStyleInput) => request<UserStyle>(`/api/styles/${id}`, { method: "PUT", body: json(input) }),
    /** 참고 자료(텍스트) → 스타일 초안 (AI). 원문은 저장되지 않는다 */
    extract: (text: string, channelIds: ChannelId[]) =>
      request<UserStyleInput & { provider: string }>("/api/styles/extract", { method: "POST", body: json({ text, channelIds }) }),
    setDefault: (id: string) => request<UserStyle>(`/api/styles/${id}`, { method: "PATCH" }),
    remove: (id: string) => request<{ id: string }>(`/api/styles/${id}`, { method: "DELETE" }),
  },

  photos: {
    /** 블로그 사진 설명 (AI Vision). 작은 미리보기만 보내고 저장하지 않는다 */
    describe: (images: { mediaType: string; data: string }[], productName?: string) =>
      request<{ captions: string[]; provider: string }>("/api/contents/describe-photos", { method: "POST", body: json({ images, productName }) }),
  },

  /** 콘텐츠 프로필 ("무엇을 다룰 것인가") */
  profiles: {
    list: () => request<ContentProfile[]>("/api/profiles"),
    create: (input: ContentProfileInput) => request<ContentProfile>("/api/profiles", { method: "POST", body: json(input) }),
    createExample: () => request<ContentProfile>("/api/profiles", { method: "POST", body: json({ example: true }) }),
    update: (id: string, input: ContentProfileInput) => request<ContentProfile>(`/api/profiles/${id}`, { method: "PUT", body: json(input) }),
    setDefault: (id: string) => request<ContentProfile>(`/api/profiles/${id}`, { method: "PATCH" }),
    remove: (id: string) => request<{ id: string }>(`/api/profiles/${id}`, { method: "DELETE" }),
  },

  memory: {
    overview: () =>
      request<{ counts: Record<"profiles" | "products" | "styles" | "contents" | "exemplars" | "feedback" | "performance", number> }>(
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
    /** 여러 URL 한 번에 (최대 20개). URL 별 성공·실패를 돌려준다 */
    importMany: (urls: string[], note?: string) =>
      request<{ url: string; ok: boolean; video?: ReferenceVideo; error?: string }[]>("/api/videos/batch", {
        method: "POST",
        body: json({ urls, note }),
      }),
    remove: (id: string) => request<{ id: string }>(`/api/videos/${id}`, { method: "DELETE" }),
  },

  admin: {
    users: () => request<UserProfile[]>("/api/admin/users"),
    updateRole: (userId: string, role: MemberRole) =>
      request<UserProfile>(`/api/admin/users/${userId}`, { method: "PATCH", body: json({ role }) }),
    permissions: () => request<PermissionRow[]>("/api/admin/permissions"),
    setPermission: (role: MemberTier, permissionKey: string, allowed: boolean) =>
      request<PermissionRow[]>("/api/admin/permissions", { method: "PUT", body: json({ role, permissionKey, allowed }) }),
    resetPermissions: () => request<PermissionRow[]>("/api/admin/permissions", { method: "DELETE" }),
    approve: (userId: string, role: MemberRole) =>
      request<UserProfile>(`/api/admin/users/${userId}/approve`, { method: "POST", body: json({ role }) }),
    reject: (userId: string, reason?: string) =>
      request<UserProfile>(`/api/admin/users/${userId}/reject`, { method: "POST", body: json({ reason }) }),
    auditLogs: () => request<AuditLog[]>("/api/admin/audit-logs"),
  },

  settings: {
    get: () => request<UserSettings>("/api/settings"),
    update: (input: UserSettingsInput) => request<UserSettings>("/api/settings", { method: "PATCH", body: json(input) }),
  },

  account: {
    me: () => request<UserProfile>("/api/account"),
    updateName: (name: string) => request<UserProfile>("/api/account", { method: "PATCH", body: json({ name }) }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: true }>("/api/account/password", { method: "POST", body: json({ currentPassword, newPassword }) }),
    withdraw: (password: string) => request<{ ok: true }>("/api/account/withdraw", { method: "POST", body: json({ password }) }),
  },
};
