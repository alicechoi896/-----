import type { YouTubeTrendItem, YouTubeVideoAnalysis } from "@/lib/types";

/**
 * "이 트렌드로 만들기" 링크.
 * 생성 화면은 폼 필드 이름과 같은 쿼리(?trendId=&topic=&keywords=)를 초기값으로 받는다.
 */
export function infoVideoHref(input: TrendLinkInput): string {
  return `/youtube/info-video?${params(input)}`;
}

export function productVideoHref(input: TrendLinkInput): string {
  return `/youtube/product-video?${params(input)}`;
}

/** 영상 → 생성 화면 초기값. AI 분석이 있으면 추천 제목·키워드를 우선 쓴다 */
export function trendPrefill(item: YouTubeTrendItem, analysis?: YouTubeVideoAnalysis | null) {
  const keywords = (analysis?.keywords.length ? analysis.keywords : item.tags.length ? item.tags : item.keywords).slice(0, 6);
  return { trendId: item.id, trendTitle: item.title, topic: analysis?.titleSuggestions[0] ?? item.title, keywords, category: item.category };
}

type TrendLinkInput = { trendId?: string; trendTitle?: string; topic?: string; keywords?: string[]; category?: string };

function params({ trendId, trendTitle, topic, keywords, category }: TrendLinkInput) {
  const sp = new URLSearchParams();
  if (trendId) sp.set("trendId", trendId);
  // 생성 화면의 "참고 트렌드" 칸에 보여 줄 영상 제목 (표시용)
  if (trendId && trendTitle) sp.set("trendTitle", trendTitle.slice(0, 120));
  if (topic) sp.set("topic", topic);
  if (keywords?.length) sp.set("keywords", keywords.join(", "));
  if (category) sp.set("category", category);
  return sp.toString();
}
