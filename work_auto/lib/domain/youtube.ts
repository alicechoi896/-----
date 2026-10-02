import type { YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";

/**
 * YouTube 트렌드 조회 공용 규칙 (클라이언트·서버 공용, 순수 함수)
 */

/** 조회 국가 (regionCode) 와 그 나라 언어 (relevanceLanguage). 첫 번째가 기본값 */
export const YOUTUBE_COUNTRIES: { code: string; label: string; lang: string }[] = [
  { code: "KR", label: "한국", lang: "ko" },
  { code: "US", label: "미국", lang: "en" },
  { code: "JP", label: "일본", lang: "ja" },
  { code: "TW", label: "대만", lang: "zh-Hant" },
  { code: "VN", label: "베트남", lang: "vi" },
  { code: "TH", label: "태국", lang: "th" },
  { code: "ID", label: "인도네시아", lang: "id" },
  { code: "IN", label: "인도", lang: "en" },
  { code: "GB", label: "영국", lang: "en" },
  { code: "DE", label: "독일", lang: "de" },
  { code: "FR", label: "프랑스", lang: "fr" },
  { code: "BR", label: "브라질", lang: "pt" },
  { code: "MX", label: "멕시코", lang: "es" },
  { code: "CA", label: "캐나다", lang: "en" },
  { code: "AU", label: "호주", lang: "en" },
];

/** YouTube 공식 동영상 카테고리 (videoCategoryId) */
export const YOUTUBE_CATEGORIES: { id: string; label: string }[] = [
  { id: "22", label: "인물·블로그 (브이로그)" },
  { id: "26", label: "노하우·스타일 (생활·뷰티·요리)" },
  { id: "28", label: "과학기술 (IT·리뷰)" },
  { id: "27", label: "교육 (정보·재테크·자기계발)" },
  { id: "24", label: "엔터테인먼트" },
  { id: "25", label: "뉴스·정치" },
  { id: "23", label: "코미디" },
  { id: "20", label: "게임" },
  { id: "10", label: "음악" },
  { id: "17", label: "스포츠" },
  { id: "15", label: "반려동물·동물" },
  { id: "19", label: "여행·이벤트" },
  { id: "2", label: "자동차·교통" },
  { id: "1", label: "영화·애니메이션" },
  { id: "29", label: "비영리·사회운동" },
];

export function categoryLabel(id?: string): string {
  return YOUTUBE_CATEGORIES.find((c) => c.id === id)?.label ?? "전체";
}

export function countryLabel(code: string): string {
  return YOUTUBE_COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

/** Shorts 판별 기준 (2024년 10월부터 Shorts 최대 길이 3분) */
export const SHORTS_MAX_SEC = 180;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** n일 전 ~ 오늘 */
export function dateRange(days: number, now = Date.now()): { publishedFrom: string; publishedTo: string } {
  return { publishedFrom: ymd(new Date(now - days * 86_400_000)), publishedTo: ymd(new Date(now)) };
}

/** 기본 조회 조건: 한국, 최근 7일, 전체 */
export function defaultYouTubeQuery(now = Date.now()): YouTubeTrendQuery {
  return { country: "KR", format: "all", recentDays: 7, ...dateRange(7, now) };
}

/** "최근 N일" 조건이면 오늘 기준으로 날짜를 다시 계산한다 */
export function refreshRecentRange<T extends Pick<YouTubeTrendQuery, "publishedFrom" | "publishedTo" | "recentDays">>(q: T, now = Date.now()): T {
  return q.recentDays ? { ...q, ...dateRange(q.recentDays, now) } : q;
}

/** 조회 기간(일) — Trend Score 의 최근성 계산에 쓴다 */
export function periodDaysOf(query: Pick<YouTubeTrendQuery, "publishedFrom" | "publishedTo">, now = Date.now()): number {
  const from = new Date(query.publishedFrom).getTime();
  const to = query.publishedTo ? new Date(query.publishedTo).getTime() + 86_400_000 : now;
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

/** 구독자·조회수·댓글·유형 조건 (YouTube 검색 API 가 지원하지 않아 받아온 뒤 거른다) */
export function matchesRanges(item: YouTubeTrendItem, q: YouTubeTrendQuery): boolean {
  if (q.format === "shorts" && item.format !== "shorts") return false;
  if (q.format === "long" && item.format !== "long") return false;
  if (q.minSubscribers != null && item.channelSubscribers < q.minSubscribers) return false;
  if (q.maxSubscribers != null && item.channelSubscribers > q.maxSubscribers) return false;
  if (q.minViews != null && item.views < q.minViews) return false;
  if (q.maxViews != null && item.views >= q.maxViews) return false;
  if (q.minComments != null && (item.commentCount ?? 0) < q.minComments) return false;
  return true;
}

const STOPWORDS = new Set([
  "shorts", "short", "the", "and", "with", "for", "you", "영상", "이것", "정말", "진짜", "그리고", "하는", "있는", "없는", "이유", "방법",
  "추천", "리뷰", "브이로그", "vlog", "ft", "feat", "official", "mv", "eng", "sub", "kor",
]);

/**
 * 추천 키워드 (AI 없이 즉시 계산):
 * 불러온 영상의 태그와 제목 단어를 모아, 그 영상의 Trend Score 를 가중치로 더한 뒤 상위를 고른다.
 * 많이 나오면서 성과도 좋은 영상에 붙은 단어일수록 위로 올라온다.
 */
export function recommendKeywords(items: YouTubeTrendItem[], limit = 12): { text: string; score: number; count: number }[] {
  const acc = new Map<string, { text: string; score: number; videos: Set<string> }>();
  const add = (raw: string, item: YouTubeTrendItem, weight: number) => {
    const text = raw.trim().replace(/^#/, "");
    const key = text.toLowerCase();
    if (text.length < 2 || text.length > 20 || STOPWORDS.has(key) || /^\d+$/.test(text)) return;
    const cur = acc.get(key) ?? { text, score: 0, videos: new Set<string>() };
    if (!cur.videos.has(item.videoId)) {
      cur.videos.add(item.videoId);
      cur.score += (item.trendScore + 10) * weight;
    }
    acc.set(key, cur);
  };
  for (const item of items) {
    item.tags.slice(0, 15).forEach((t) => add(t, item, 1));
    item.title
      .replace(/[#[\](){}|,.!?…"'“”‘’~:;/\\]/g, " ")
      .split(/\s+/)
      .forEach((w) => add(w, item, 0.6));
  }
  return [...acc.values()]
    .filter((k) => k.videos.size >= (items.length >= 10 ? 2 : 1))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((k) => ({ text: k.text, score: Math.round(k.score), count: k.videos.size }));
}
