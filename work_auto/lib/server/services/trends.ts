import "server-only";
import { YOUTUBE_CATEGORIES, YOUTUBE_COUNTRIES, dateRange, defaultYouTubeQuery } from "@/lib/domain/youtube";
import { NAVER_TREND_CATEGORIES } from "@/lib/mock/naver-trends";
import type { NaverTrendQuery, TrendOption, TrendPeriod, YouTubeTrendQuery } from "@/lib/types";
import { AppError } from "../http";
import { getNaverTrendProvider, getYouTubeTrendProvider } from "../providers/registry";
import { savedTrendService } from "./saved-trends";

const PERIODS: TrendPeriod[] = [7, 14, 21, 30];
const toPeriod = (v: unknown): TrendPeriod => (PERIODS.includes(Number(v) as TrendPeriod) ? (Number(v) as TrendPeriod) : 7);

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
    minComments: toCount(raw.minComments),
    pageToken: str("pageToken").slice(0, 200) || undefined,
  };
}

export const trendService = {
  /** YouTube 트렌드 한 페이지. 다음 페이지는 nextPageToken 으로 이어서 부른다 */
  async searchYouTube(params: URLSearchParams) {
    const query = normalizeYouTubeQuery(Object.fromEntries(params.entries()));
    const provider = await getYouTubeTrendProvider();
    const page = await provider.searchTrends(query);
    return { ...page, query, provider: provider.id };
  },

  async getNaverInsight(params: URLSearchParams) {
    const query: NaverTrendQuery = {
      category: params.get("category") || undefined,
      keyword: params.get("keyword") || undefined,
      periodDays: toPeriod(params.get("period")),
      scope: params.get("scope") === "blog" ? "blog" : "clip",
    };
    const provider = await getNaverTrendProvider();
    return { insight: await provider.getInsight(query), provider: provider.id };
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
    const insights = await Promise.all(
      NAVER_TREND_CATEGORIES.map((category) => provider.getInsight({ category, periodDays: 7, scope: "clip" })),
    );
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
