import "server-only";
import { buildNaverInsight } from "@/lib/mock/naver-trends";
import type { NaverTrendInsight, NaverTrendMore, NaverTrendQuery, NaverTrendSection } from "@/lib/types";
import { serverConfig } from "../../config";
import type { KeywordEvidencePost, NaverTrendProvider } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAGE = 10;

export class MockNaverTrendProvider implements NaverTrendProvider {
  readonly id = "mock-naver";
  readonly kind = "naver-trend" as const;
  readonly label = "NAVER (Mock)";

  async testConnection() {
    return { ok: true, message: "Mock NAVER 데이터를 사용합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  /** 실제 Provider 와 같게 급상승·관련·아이디어는 10개씩 (나머지는 [더보기]) */
  /** 데모: 검색어로 만든 가짜 블로그 글 */
  async blogEvidence(seed: string, display: number): Promise<KeywordEvidencePost[]> {
    const angles = ["추천", "후기", "비교", "가성비", "구매 가이드", "장단점", "사용법", "2026", "순위", "할인"];
    return Array.from({ length: Math.min(display, 30) }, (_, i) => ({
      title: `${seed} ${angles[i % angles.length]} 총정리`,
      description: `${seed} ${angles[(i + 2) % angles.length]} ${angles[(i + 4) % angles.length]} 솔직하게 정리했어요`,
      postdate: new Date(Date.now() - i * 3 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
    }));
  }

  /** 데모: 상대 관심도 (검색량 아님) */
  async relativeInterest(keywords: string[]): Promise<Record<string, { avg: number; recent: number; previous: number }>> {
    return Object.fromEntries(keywords.slice(0, 5).map((k, i) => [k, { avg: 80 - i * 12, recent: 85 - i * 10, previous: 70 - i * 12 }]));
  }

  async getInsight(query: NaverTrendQuery): Promise<NaverTrendInsight> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.6));
    const full = buildNaverInsight(query, Date.now());
    return {
      ...full,
      risingTopics: full.risingTopics.slice(0, PAGE),
      risingKeywords: full.risingKeywords.slice(0, PAGE),
      relatedKeywords: full.relatedKeywords.slice(0, PAGE),
      contentIdeas: full.contentIdeas.slice(0, PAGE),
      more: {
        rising: full.risingKeywords.length > PAGE || full.risingTopics.length > PAGE,
        related: full.relatedKeywords.length > PAGE,
        ideas: full.contentIdeas.length > PAGE,
      },
    };
  }

  async getMore(query: NaverTrendQuery, section: NaverTrendSection, offset: number): Promise<NaverTrendMore> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.3));
    const full = buildNaverInsight(query, Date.now());
    const end = offset + PAGE;
    if (section === "rising") {
      return {
        section,
        risingKeywords: full.risingKeywords.slice(offset, end),
        risingTopics: full.risingTopics.slice(offset, end),
        hasMore: full.risingKeywords.length > end || full.risingTopics.length > end,
      };
    }
    if (section === "related") return { section, relatedKeywords: full.relatedKeywords.slice(offset, end), hasMore: full.relatedKeywords.length > end };
    return { section, contentIdeas: full.contentIdeas.slice(offset, end), hasMore: full.contentIdeas.length > end };
  }
}
