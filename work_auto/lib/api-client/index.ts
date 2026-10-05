import type { PermissionRow } from "@/lib/permissions";
import type { StyleImportKind } from "@/lib/style-limits";
import type { StyleImportPreview } from "@/lib/types";
import type { PreciseStage } from "@/lib/generators/quality";
import type { OutlierScore } from "@/lib/domain/outlier";
import type { PromptVersionRow } from "@/lib/domain/prompt-stats";
import type {
  ScriptExample,
  ScriptFormat,
  ScriptFormatInput,
  ScriptFormatType,
  ApiConnectionPublic,
  ErrorLog,
  NaverTrendMore,
  NaverTrendSection,
  LearningProfile,
  LearningProfileView,
  ContentPublicationInput,
  ContentPublicationView,
  ContentUploadState,
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
  SocialContinue,
  RawProductData,
  SocialPeriodOption,
  SocialPlatform,
  SocialSearchResultDto,
  SocialSortOption,
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
      // 파일 업로드(FormData)는 브라우저가 multipart 경계를 직접 붙이도록 Content-Type 을 비워 둔다
      headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
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

/** 정밀 생성 스트림 읽기: {"type":"stage"} 줄마다 onStage, 마지막 {"type":"done"|"error"} */
async function streamPrecise(req: GenerateContentRequest, onStage: (stage: PreciseStage) => void): Promise<GeneratedContent> {
  let res: Response;
  try {
    res = await fetch("/api/contents/generate/precise", { method: "POST", headers: { "Content-Type": "application/json" }, body: json(req), cache: "no-store" });
  } catch {
    throw new ApiError("NETWORK", "서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.");
  }
  // 스트림을 열기 전 오류(권한·호출 한도)는 일반 JSON
  if (!res.headers.get("content-type")?.includes("ndjson") || !res.body) {
    const body = (await res.json().catch(() => null)) as ApiResult<GeneratedContent> | null;
    if (body && !body.ok) throw new ApiError(body.error.code, body.error.message);
    throw new ApiError("BAD_RESPONSE", "서버 응답을 해석할 수 없습니다.");
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { type: "stage"; stage: PreciseStage } | { type: "done"; data: GeneratedContent } | { type: "error"; error: { code: string; message: string } };
      if (msg.type === "stage") onStage(msg.stage);
      else if (msg.type === "done") {
        clearApiCache();
        return msg.data;
      } else throw new ApiError(msg.error.code, msg.error.message);
    }
    if (done) break;
  }
  throw new ApiError("BAD_RESPONSE", "생성이 중간에 끊겼습니다. 다시 시도해 주세요.");
}

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  trends: {
    /** 한 페이지(최대 50개 조회). 이어서 부를 때는 q.pageToken 에 nextPageToken 을 넣는다 */
    /** fill: 걸러져 남는 영상이 적으면 서버가 다음 페이지를 이어서 받는다 (첫 검색용) */
    youtube: ({ scope: _scope, ...q }: YouTubeTrendQuery, opts: { fill?: boolean } = {}) => {
      void _scope; // 조사 범위는 서버가 profileId 로 풀어 넣는다
      return request<YouTubeTrendPage & { query: YouTubeTrendQuery; provider: string }>(`/api/trends/youtube${qs({ ...q, fill: opts.fill ? "1" : undefined })}`);
    },
    analyzeVideo: (video: YouTubeTrendItem) =>
      request<YouTubeVideoAnalysis & { provider: string }>("/api/trends/youtube/analyze", { method: "POST", body: json({ video }) }),
    /** 아웃라이어 점수 (누를 때만, YouTube 할당량 사용) */
    outliers: (items: { videoId: string; channelId: string; views: number }[]) =>
      request<{ scores: Record<string, OutlierScore | null>; unitsUsed: number; channels: number; cachedChannels: number }>("/api/trends/youtube/outliers", { method: "POST", body: json({ items }) }),
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
    /** NAVER 트렌드 [더보기] 10개 더 */
    naverMore: (
      q: { scope: "clip" | "blog"; category?: string; keyword?: string; periodDays: number; profileId?: string },
      section: NaverTrendSection,
      offset: number,
    ) =>
      request<NaverTrendMore>(
        `/api/trends/naver/more${qs({ scope: q.scope, category: q.category, keyword: q.keyword, period: q.periodDays, profileId: q.profileId, section, offset })}`,
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
    /** [상세페이지 학습] 1번: 이미 학습한 상품이면 existing (외부 0회), 새 상품이면 Bright Data Trigger 1회 */
    learnUrl: (body: { url: string; clientRequestId: string; force?: boolean; productId?: string }) =>
      request<
        | { status: "existing"; productId: string; name: string }
        | { status: "collecting"; jobId: string; platform: string; canonicalKey: string; reused: boolean }
        | { status: "collected"; raw: RawProductData }
      >("/api/products/learn-url", { method: "POST", body: json(body) }),
    /** 같은 수집 작업의 상태만 (새 Trigger 아님) */
    learnStatus: (body: { jobId: string; url: string; clientRequestId: string }) =>
      request<{ status: "collecting"; progress: string } | { status: "collected"; raw: RawProductData }>("/api/products/learn-url/status", { method: "POST", body: json(body) }),
    /** 수집한 데이터 → AI 분석 (Bright Data 0회) */
    analyzeCollected: (raw: RawProductData) => request<ProductAnalysisDraft>("/api/products/analyze-collected", { method: "POST", body: json({ raw }) }),
    /** [상세페이지 다시 학습] 결과 저장 (같은 제품의 새 분석 버전) */
    relearn: (id: string, draft: ProductAnalysisDraft) => request<ProductDetail>(`/api/products/${id}/relearn`, { method: "POST", body: json({ draft }) }),
    update: (id: string, input: ProductUpdateInput) =>
      request<ProductDetail>(`/api/products/${id}`, { method: "PATCH", body: json(input) }),
    remove: (id: string) => request<{ id: string }>(`/api/products/${id}`, { method: "DELETE" }),
  },

  contents: {
    list: (filter: { featureId?: string; productId?: string } = {}) =>
      request<GeneratedContent[]>(`/api/contents${qs(filter)}`),
    generate: (req: GenerateContentRequest) =>
      request<GeneratedContent>("/api/contents/generate", { method: "POST", body: json(req) }),
    /** 정밀 생성 (AI 4회): 단계가 시작될 때마다 onStage. 응답은 NDJSON 스트림 */
    generatePrecise: (req: GenerateContentRequest, onStage: (stage: PreciseStage) => void) => streamPrecise(req, onStage),
    /** 직접 수정 · 후보 선택 (학습 신호) */
    annotate: (id: string, body: { edit?: { key: string; value: string | string[] }; pick?: { key: string; values: string[] } }) =>
      request<GeneratedContent>(`/api/contents/${id}/annotations`, { method: "PATCH", body: json(body) }),
    /** 결과의 한 항목만 다시 만들기 (블로그 본문은 소제목도 함께) */
    regenerate: (id: string, key: string) =>
      request<GeneratedContent>(`/api/contents/${id}/regenerate`, { method: "POST", body: json({ key }) }),
    setExemplar: (id: string, isExemplar: boolean) =>
      request<GeneratedContent>(`/api/contents/${id}`, { method: "PATCH", body: json({ isExemplar }) }),
  },

  /** 팀 공통 학습 프로필 (docs/INCREMENTAL_LEARNING.md) */
  learning: {
    list: () => request<LearningProfileView[]>("/api/learning"),
    update: (id: string) => request<LearningProfile>(`/api/learning/${encodeURIComponent(id)}/update`, { method: "POST" }),
    rollback: (id: string) => request<LearningProfile>(`/api/learning/${encodeURIComponent(id)}/rollback`, { method: "POST" }),
  },

  /** 오류 기록 */
  errors: {
    /** 화면 오류 보내기 (실패해도 무시) */
    report: (e: { message: string; stack?: string; path?: string }) => request<{ ok: boolean }>("/api/errors", { method: "POST", body: json(e) }),
    list: (days: number) => request<ErrorLog[]>(`/api/admin/errors${qs({ days })}`),
    remove: (ids: string[] | "all") => request<{ deleted: number }>("/api/admin/errors", { method: "DELETE", body: json({ ids }) }),
  },

  /** 업로드 관리 (팀 공용 캘린더) */
  publications: {
    list: (from: string, to: string) => request<ContentPublicationView[]>(`/api/publications${qs({ from, to })}`),
    create: (input: Partial<ContentPublicationInput>) => request<ContentPublicationView>("/api/publications", { method: "POST", body: json(input) }),
    update: (id: string, input: Partial<ContentPublicationInput>) =>
      request<ContentPublicationView>(`/api/publications/${id}`, { method: "PUT", body: json(input) }),
    remove: (id: string) => request<{ id: string }>(`/api/publications/${id}`, { method: "DELETE" }),
    /** 생성 콘텐츠별 업로드 상태 (없으면 미업로드) */
    status: (ids: string[]) => request<Record<string, ContentUploadState>>(`/api/publications/status${qs({ ids: ids.join(",") })}`),
    assignees: () => request<{ id: string; name: string }[]>("/api/publications/assignees"),
    /** YouTube 업로드의 현재 숫자 (+ 1일·7일 기록) */
    stats: (ids: string[]) =>
      request<Record<string, { views?: number | null; likes?: number | null; comments?: number | null; d1?: number | null; d7?: number | null; manual?: { views: number; at: string } | null }>>(
        `/api/publications/stats${qs({ ids: ids.join(",") })}`,
      ),
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
    /** 원하는 유형으로 예시 문장 10개 (AI, 저장하지 않음) */
    typeExamples: (body: { kind: string; types: string[]; tone?: string; existing?: string[] }) =>
      request<{ items: string[]; provider: string }>("/api/styles/type-examples", { method: "POST", body: json(body) }),
    setDefault: (id: string) => request<UserStyle>(`/api/styles/${id}`, { method: "PATCH" }),
    /** .txt/.csv 파일 일괄 추가 미리보기 (저장하지 않는다). TXT 는 target 필요 */
    importPreview: (file: File, target?: StyleImportKind) => {
      const body = new FormData();
      body.append("file", file);
      if (target) body.append("target", target);
      return request<StyleImportPreview>("/api/styles/import", { method: "POST", body });
    },
    remove: (id: string) => request<{ id: string }>(`/api/styles/${id}`, { method: "DELETE" }),
  },

  publicationViews: {
    /** 업로드한 콘텐츠의 조회수를 직접 넣는다 (성과 데이터 → 학습) */
    record: (publicationId: string, body: { views: number; likes?: number | null; comments?: number | null }) =>
      request<PerformanceMetric>(`/api/publications/${publicationId}/views`, { method: "POST", body: json(body) }),
  },

  scriptFormats: {
    list: () => request<ScriptFormat[]>("/api/script-formats"),
    create: (input: ScriptFormatInput) => request<ScriptFormat>("/api/script-formats", { method: "POST", body: json(input) }),
    update: (id: string, input: ScriptFormatInput) => request<ScriptFormat>(`/api/script-formats/${id}`, { method: "PUT", body: json(input) }),
    setDefault: (id: string) => request<ScriptFormat>(`/api/script-formats/${id}`, { method: "PATCH" }),
    remove: (id: string) => request<{ id: string }>(`/api/script-formats/${id}`, { method: "DELETE" }),
    /** [대본 포맷에 담기]: 제목만 기존 포맷에 더하거나 새 포맷으로 */
    addTitles: (body: { formatId?: string; newFormat?: { name: string; contentType: ScriptFormatType }; titles: { title: string; views: number | null }[] }) =>
      request<{ format: ScriptFormat; added: number; duplicated: number; overLimit: number }>("/api/script-formats/titles", { method: "POST", body: json(body) }),
    /** 참고 대본 → 포맷 가이드라인 (AI, 저장하지 않음) */
    analyze: (examples: ScriptExample[], contentType: ScriptFormatType) =>
      request<{ name: string; guideline: string; provider: string }>("/api/script-formats/analyze", { method: "POST", body: json({ examples, contentType }) }),
  },

  photos: {
    /** 블로그 사진 설명 (AI Vision). 작은 미리보기만 보내고 저장하지 않는다 */
    describe: (images: { mediaType: string; data: string }[], productName?: string) =>
      request<{ captions: string[]; provider: string }>("/api/contents/describe-photos", { method: "POST", body: json({ images, productName }) }),
    /** 제품 사진 배경만 AI 로 바꾸기 (OpenAI 이미지). 사진은 저장하지 않는다 */
    aiEdit: (image: string, style: string) =>
      request<{ image: string; mediaType: string; demo: boolean; styleLabel: string }>("/api/photos/ai-edit", { method: "POST", body: json({ image, style }) }),
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
    /** 체크한 항목 삭제 (콘텐츠 히스토리·제품·피드백·성과) */
    deleteMany: (kind: "contents" | "products" | "feedback" | "performance", ids: string[]) =>
      request<{ deleted: number }>("/api/memory/delete", { method: "POST", body: json({ kind, ids }) }),
    overview: () =>
      request<{ counts: Record<"profiles" | "products" | "styles" | "scriptFormats" | "contents" | "exemplars" | "feedback" | "performance", number> }>(
        "/api/memory",
      ),
    performance: () => request<(PerformanceMetric & { headline: string })[]>("/api/performance"),
    /** 프롬프트 버전별 성과표 */
    promptStats: () => request<PromptVersionRow[]>("/api/performance/prompts"),
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
    /** productId: 특정 제품 / "none" = 제품 연결 안 됨 / 생략 = 전체 */
    list: (productId?: string) => request<ReferenceVideo[]>(`/api/videos${qs({ productId })}`),
    import: (url: string, note?: string) => request<ReferenceVideo>("/api/videos", { method: "POST", body: json({ url, note }) }),
    /** 샤오홍슈 노트·도우인 영상의 재생 주소 (서버는 주소만, 파일은 브라우저가 직접 받는다) */
    resolve: (url: string) =>
      request<{
        noteId: string;
        title: string;
        author: string;
        durationSec: number;
        streams: { codec: string; width: number; height: number; size: number | null; url: string; backupUrls: string[] }[];
      }>("/api/videos/resolve", { method: "POST", body: json({ url }) }),
    /** 샤오홍슈 또는 도우인 검색 = TikHub 1회 (한국어는 AI 로 한 번 변환). next = [더 보기]. 결과는 저장하지 않는다 */
    socialSearch: (body: {
      keyword: string;
      platform: SocialPlatform;
      autoTranslate: boolean;
      sort: SocialSortOption;
      period: SocialPeriodOption;
      next?: SocialContinue | null;
      clientRequestId?: string;
    }) => request<SocialSearchResultDto>("/api/videos/social-search", { method: "POST", body: json(body) }),
    /** 검색 결과 중국어 제목 → 한국어 (한 페이지를 묶어 AI 1회). 저장하지 않는다 */
    translateTitles: (items: { id: string; title: string }[]) =>
      request<{ items: { id: string; translatedTitle: string }[]; provider: string | null }>("/api/videos/translate-titles", { method: "POST", body: json({ items }) }),
    /** 기존 참고 영상 30개씩 (productId: 제품 id / none / all) */
    page: (productId: string, offset = 0) =>
      request<{ items: ReferenceVideo[]; hasMore: boolean; nextOffset: number }>(`/api/videos/page${qs({ productId, offset })}`),
    /** 여러 URL 한 번에 (최대 20개). URL 별 성공·실패를 돌려준다 */
    /** meta: 검색 결과에 이미 있는 작성자·길이·썸네일 (있으면 서버가 상세 API 를 부르지 않는다) */
    importMany: (items: { url: string; titleHint?: string; meta?: { channelName?: string | null; durationSec?: number | null; thumbnailUrl?: string | null } }[], note?: string, productId?: string | null) =>
      request<{ url: string; ok: boolean; video?: ReferenceVideo; error?: string }[]>("/api/videos/batch", {
        method: "POST",
        body: json({ items, note, productId: productId || null }),
      }),
    setProduct: (id: string, productId: string | null) =>
      request<ReferenceVideo>(`/api/videos/${id}`, { method: "PATCH", body: json({ productId }) }),
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
