import "server-only";
import { YOUTUBE_CATEGORIES, YOUTUBE_COUNTRIES, dateRange, defaultYouTubeQuery } from "@/lib/domain/youtube";
import { NAVER_TREND_CATEGORIES } from "@/lib/mock/naver-trends";
import { NAVER_PERIODS, type NaverPeriod, type NaverTrendQuery, type TrendOption, type YouTubeTrendQuery } from "@/lib/types";
import { AppError } from "../http";
import { getNaverTrendProvider, getYouTubeTrendProvider } from "../providers/registry";
import { contentProfileService } from "./content-profiles";
import { savedTrendService } from "./saved-trends";

const toNaverPeriod = (v: unknown): NaverPeriod => (NAVER_PERIODS.includes(Number(v) as NaverPeriod) ? (Number(v) as NaverPeriod) : 14);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toCount(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

/**
 * 조회 조건 정리 (URL 파라미터, 저장된 필터 JSON 공용).
 * 잘못된 값은 버리고 기본값(한국, 최근 7일)으로 채운다.
 */
export function normalizeYouTubeQuery(raw: Record<string, unknown>): YouTubeTrendQuery {
  const base = defaultYouTubeQuery();
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const country = YOUTUBE_COUNTRIES.some((c) => c.code === str("country")) ? str("country") : base.country;
  const categoryId = YOUTUBE_CATEGORIES.some((c) => c.id === str("categoryId")) ? str("categoryId") : undefined;
  const recent = toCount(raw.recentDays);
  const recentDays = recent && recent >= 1 && recent <= 3650 ? recent : undefined;
  const range = recentDays ? dateRange(recentDays) : null;
  const publishedFrom = range?.publishedFrom ?? (DATE_RE.test(str("publishedFrom")) ? str("publishedFrom") : base.publishedFrom);
  const publishedTo = range?.publishedTo ?? (DATE_RE.test(str("publishedTo")) ? str("publishedTo") : undefined);
  if (publishedTo && publishedTo < publishedFrom) throw new AppError("VALIDATION", "게시일 범위가 올바르지 않습니다. 시작일이 종료일보다 늦습니다.");
  const format = ["shorts", "long"].includes(str("format")) ? (str("format") as "shorts" | "long") : "all";
  return {
    country,
    categoryId,
    keyword: str("keyword").slice(0, 100) || undefined,
    publishedFrom,
    publishedTo,
    recentDays,
    format,
    minSubscribers: toCount(raw.minSubscribers),
    maxSubscribers: toCount(raw.maxSubscribers),
    minViews: toCount(raw.minViews),
    maxViews: toCount(raw.maxViews),
    pageToken: str("pageToken").slice(0, 200) || undefined,
    profileId: str("profileId").slice(0, 60) || undefined,
  };
}

/** 첫 화면 자동 채우기: 남는 영상이 이만큼 안 되면 최대 2페이지 더 (약 306 units) */
const YT_FILL = { target: 20, extraPages: 2 };

/** NAVER 트렌드 조회 조건 (콘텐츠 프로필은 "무엇을 조사할지"만 정한다. 분석 방식은 NAVER Provider 가 따로) */
async function naverQuery(params: URLSearchParams): Promise<NaverTrendQuery> {
  const query: NaverTrendQuery = {
    category: params.get("category") || undefined,
    keyword: params.get("keyword")?.trim().slice(0, 50) || undefined,
    periodDays: toNaverPeriod(params.get("period")),
    scope: params.get("scope") === "blog" ? "blog" : "clip",
    profileId: params.get("profileId") || undefined,
  };
  query.profileScope = await contentProfileService.resolveScope(query.profileId);
  return query;
}

export const trendService = {
  /** YouTube 트렌드 한 페이지. 다음 페이지는 nextPageToken 으로 이어서 부른다 */
  async searchYouTube(params: URLSearchParams) {
    const query = normalizeYouTubeQuery(Object.fromEntries(params.entries()));
    // 콘텐츠 프로필은 "무엇을 조사할지"만 정한다. 어떻게 찾을지는 YouTube Provider 가 따로 처리한다
    const [scope, provider] = await Promise.all([contentProfileService.resolveScope(query.profileId), getYouTubeTrendProvider()]);
    query.scope = scope;
    let page = await provider.searchTrends(query);
    // fill=1: 조건(구독자·조회수·제목 언어)으로 걸러져 남는 영상이 적으면 다음 페이지를 서버에서 이어서 받는다 (최대 2페이지 더)
    if (params.get("fill") === "1") {
      let items = page.items;
      let fetched = page.fetched;
      for (let extra = 0; extra < YT_FILL.extraPages && items.length < YT_FILL.target && page.nextPageToken; extra++) {
        page = await provider.searchTrends({ ...query, pageToken: page.nextPageToken });
        const seen = new Set(items.map((i) => i.id));
        items = [...items, ...page.items.filter((i) => !seen.has(i.id))];
        fetched += page.fetched;
      }
      page = { ...page, items, fetched };
    }
    return { ...page, query, provider: provider.id };
  },

  async getNaverInsight(params: URLSearchParams) {
    const [query, provider] = await Promise.all([naverQuery(params), getNaverTrendProvider()]);
    return { insight: await provider.getInsight(query), provider: provider.id };
  },

  /** [더보기] 10개 더 (rising: 급상승 키워드·주제 / related: 관련 키워드 / ideas: 콘텐츠·글 아이디어) */
  async getNaverMore(params: URLSearchParams) {
    const section = params.get("section");
    if (section !== "rising" && section !== "related" && section !== "ideas") throw new AppError("VALIDATION", "더 불러올 목록이 올바르지 않습니다.");
    const offset = Math.max(0, Math.min(200, Math.floor(Number(params.get("offset")) || 0)));
    const [query, provider] = await Promise.all([naverQuery(params), getNaverTrendProvider()]);
    return provider.getMore(query, section, offset);
  },

  /**
   * 생성 폼의 "참고 트렌드" 목록.
   * YouTube: 찜한 영상 → 기본 검색 조건(없으면 한국·최근 7일) 상위 결과 순서.
   */
  async listOptions(source: "youtube" | "naver"): Promise<TrendOption[]> {
    if (source === "youtube") {
      const [saved, defaultFilter] = await Promise.all([savedTrendService.list(), savedTrendService.getDefaultFilter()]);
      const bookmarked: TrendOption[] = saved.map((t) => ({
        id: t.trendId,
        source: "youtube",
        title: t.title,
        keywords: t.keywords,
        group: "찜한 영상",
      }));
      const query = defaultFilter ? normalizeYouTubeQuery(defaultFilter.params as Record<string, unknown>) : defaultYouTubeQuery();
      query.scope = await contentProfileService.resolveScope();
      const groupName = defaultFilter ? `기본 조건: ${defaultFilter.name}` : "최근 7일 인기 (한국)";
      const page = await (await getYouTubeTrendProvider()).searchTrends(query).catch(() => ({ items: [] }));
      const seen = new Set(bookmarked.map((o) => o.id));
      const fromSearch: TrendOption[] = [...page.items]
        .sort((a, b) => b.trendScore - a.trendScore)
        .filter((i) => !seen.has(i.id))
        .slice(0, 20)
        .map((i) => ({ id: i.id, source: "youtube", title: i.title, keywords: i.keywords, group: groupName }));
      return [...bookmarked, ...fromSearch];
    }
    const provider = await getNaverTrendProvider();
    // 콘텐츠 프로필이 있으면 그 범위 1번만, 없으면 데모 카테고리별로
    const profileScope = await contentProfileService.resolveScope();
    const insights = profileScope
      ? [await provider.getInsight({ periodDays: 7, scope: "clip", profileScope })]
      : await Promise.all(NAVER_TREND_CATEGORIES.map((category) => provider.getInsight({ category, periodDays: 7, scope: "clip" })));
    return insights.flatMap((ins) =>
      ins.risingTopics.map((t) => ({ id: t.id, source: "naver" as const, title: `${t.title} (${t.category})`, keywords: t.keywords })),
    );
  },

  /** 생성할 때 고른 트렌드 1개. YouTube 는 목록에 없어도(트렌드 화면에서 바로 넘어온 경우) 영상 ID 로 조회한다 */
  async findOption(id: string): Promise<TrendOption | null> {
    if (id.startsWith("yt_")) {
      const saved = (await savedTrendService.list()).find((t) => t.trendId === id);
      if (saved) return { id, source: "youtube", title: saved.title, keywords: saved.tags.length ? saved.tags.slice(0, 8) : saved.keywords };
      const item = await (await getYouTubeTrendProvider()).getTrendItem(id.slice(3)).catch(() => null);
      return item ? { id, source: "youtube", title: item.title, keywords: item.tags.length ? item.tags.slice(0, 8) : item.keywords } : null;
    }
    const options = await this.listOptions("naver");
    return options.find((o) => o.id === id) ?? null;
  },
};
