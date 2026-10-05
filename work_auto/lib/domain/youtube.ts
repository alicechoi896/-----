import type { YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";
import { hasExcluded } from "@/lib/types/profile";

/**
 * YouTube 트렌드 조회 공용 규칙 (클라이언트·서버 공용, 순수 함수)
 */

/**
 * 조회 국가.
 * YouTube API 의 regionCode 는 "그 나라에서 볼 수 있는 영상"이라는 뜻이라 외국 영상이 섞인다 (IP 를 바꿔도 같다).
 * 그래서 **제목 언어(글자)** 로 한 번 더 거른다: 한국 = 한글 제목, 일본 = 가나 제목 …
 * 글자로 구분할 수 없는 나라(영국·독일·브라질 등)는 목록에 두지 않는다. 첫 번째가 기본값.
 */
export const YOUTUBE_COUNTRIES: { code: string; label: string; lang: string }[] = [
  { code: "KR", label: "한국 (한국어 제목)", lang: "ko" },
  { code: "JP", label: "일본 (일본어 제목)", lang: "ja" },
  { code: "TW", label: "중화권 (중국어 제목)", lang: "zh-Hant" },
  { code: "US", label: "영어권 (영어 제목)", lang: "en" },
  { code: "TH", label: "태국 (태국어 제목)", lang: "th" },
  { code: "VN", label: "베트남 (베트남어 제목)", lang: "vi" },
];

const HANGUL = /[\uAC00-\uD7A3]/;
const KANA = /[\u3040-\u30FF]/;
const CJK = /[\u4E00-\u9FFF]/;
const THAI = /[\u0E00-\u0E7F]/;
const VIET = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;
const LATIN_WORD = /[A-Za-z]{2,}/;

/** 제목이 그 나라 언어로 쓰였는가 (한국 = 한글이 들어간 제목) */
export function titleMatchesCountry(title: string, country: string): boolean {
  switch (country) {
    case "KR":
      return HANGUL.test(title);
    case "JP":
      return KANA.test(title);
    case "TW":
      return CJK.test(title) && !KANA.test(title) && !HANGUL.test(title);
    case "TH":
      return THAI.test(title);
    case "VN":
      return VIET.test(title);
    case "US":
      return LATIN_WORD.test(title) && !HANGUL.test(title) && !KANA.test(title) && !CJK.test(title) && !THAI.test(title) && !VIET.test(title);
    default:
      return true;
  }
}

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

/** 기본 조회 조건: 한국, 최근 7일, Shorts, 구독자·조회수 제한 없음 (자주 쓰는 조건은 사용자가 저장해 쓴다) */
export const DEFAULT_RANGES = { minSubscribers: 0, minViews: 0 } as const;

export function defaultYouTubeQuery(now = Date.now()): YouTubeTrendQuery {
  return { country: "KR", format: "shorts", recentDays: 7, ...dateRange(7, now), ...DEFAULT_RANGES };
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

/**
 * YouTube 검색어(q) 만들기: 콘텐츠 프로필 범위 + 이번 검색어.
 * - 검색어가 있으면 그 검색어로 좁힌다 (프로필 범위 안의 세부 주제)
 * - 없으면 프로필의 관심 키워드·세부 관심분야를 OR(|) 로 묶어 넓게 찾는다
 * - 제외 키워드는 YouTube 의 -검색어 로 뺀다 (결과에서도 한 번 더 거른다)
 */
export function buildYouTubeSearchQ(q: Pick<YouTubeTrendQuery, "keyword" | "scope">): string | undefined {
  const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t);
  const parts: string[] = [];
  const kw = q.keyword?.trim();
  if (kw) parts.push(kw);
  else if (q.scope) {
    const terms = [...q.scope.seedKeywords, ...q.scope.subCategories].slice(0, 12);
    parts.push(terms.length ? terms.map(quote).join("|") : q.scope.mainCategory);
  }
  if (q.scope && parts.length) parts.push(...q.scope.excludeKeywords.slice(0, 8).map((e) => `-${e.replace(/\s+/g, "")}`));
  return parts.join(" ") || undefined;
}

/** 구독자·조회수·댓글·유형 조건 (YouTube 검색 API 가 지원하지 않아 받아온 뒤 거른다) */
export function matchesRanges(item: YouTubeTrendItem, q: YouTubeTrendQuery): boolean {
  if (q.format === "shorts" && item.format !== "shorts") return false;
  if (q.format === "long" && item.format !== "long") return false;
  if (q.minSubscribers != null && item.channelSubscribers < q.minSubscribers) return false;
  if (q.maxSubscribers != null && item.channelSubscribers > q.maxSubscribers) return false;
  if (q.minViews != null && item.views < q.minViews) return false;
  if (q.maxViews != null && item.views >= q.maxViews) return false;
  // 나라 = 제목 언어 (YouTube 의 국가 설정만으로는 외국 영상이 섞인다)
  if (q.country && !titleMatchesCountry(item.title, q.country)) return false;
  if (q.scope && hasExcluded(`${item.title} ${item.tags.join(" ")}`, q.scope.excludeKeywords)) return false;
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
