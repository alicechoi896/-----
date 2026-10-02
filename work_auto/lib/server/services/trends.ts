import "server-only";
import { NAVER_TREND_CATEGORIES } from "@/lib/mock/naver-trends";
import type { NaverTrendQuery, TrendOption, TrendPeriod, YouTubeTrendQuery } from "@/lib/types";
import { getNaverTrendProvider, getYouTubeTrendProvider } from "../providers/registry";

const PERIODS: TrendPeriod[] = [7, 14, 21, 30];
const toPeriod = (v: unknown): TrendPeriod => (PERIODS.includes(Number(v) as TrendPeriod) ? (Number(v) as TrendPeriod) : 7);

export const trendService = {
  async searchYouTube(params: URLSearchParams) {
    const query: YouTubeTrendQuery = {
      category: params.get("category") || undefined,
      keyword: params.get("keyword") || undefined,
      periodDays: toPeriod(params.get("period")),
      format: (params.get("format") as YouTubeTrendQuery["format"]) || "all",
      sort: (params.get("sort") as YouTubeTrendQuery["sort"]) || "trendScore",
    };
    const provider = await getYouTubeTrendProvider();
    return { items: await provider.searchTrends(query), query, provider: provider.id };
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

  /** 생성 폼의 "트렌드 선택" 목록 */
  async listOptions(source: "youtube" | "naver"): Promise<TrendOption[]> {
    if (source === "youtube") {
      const provider = await getYouTubeTrendProvider();
      const items = await provider.searchTrends({ periodDays: 21, sort: "trendScore" });
      return items.slice(0, 15).map((i) => ({ id: i.id, source: "youtube", title: i.title, keywords: i.keywords }));
    }
    const provider = await getNaverTrendProvider();
    const insights = await Promise.all(
      NAVER_TREND_CATEGORIES.map((category) => provider.getInsight({ category, periodDays: 7, scope: "clip" })),
    );
    return insights.flatMap((ins) =>
      ins.risingTopics.map((t) => ({ id: t.id, source: "naver" as const, title: `${t.title} (${t.category})`, keywords: t.keywords })),
    );
  },

  async findOption(id: string): Promise<TrendOption | null> {
    const source = id.startsWith("yt_") ? "youtube" : "naver";
    const options = await this.listOptions(source);
    return options.find((o) => o.id === id) ?? null;
  },
};
