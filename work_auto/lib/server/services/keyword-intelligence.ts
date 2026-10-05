import "server-only";
import type { KeywordCandidate, KeywordIntelligence, KeywordTrendSignal } from "@/lib/types/keyword-intel";
import type { KeywordEvidencePost, KeywordEvidenceVideo } from "../providers/types";
import { getNaverTrendProvider, getYouTubeTrendProvider } from "../providers/registry";

/**
 * Keyword Intelligence — 생성 직전에 실제 플랫폼 데이터로 키워드 후보를 모은다. docs/KEYWORD_INTELLIGENCE.md
 *  YouTube (YouTube 영상·클립 아님 → YouTube 기능만): search.list 1회 + videos.list 1회 → 제목·설명·태그·조회수·게시일
 *  NAVER (클립·블로그): 블로그 검색 1회 + 데이터랩 1회(상위 후보 5개 상대 관심도)
 *  - 생성 버튼 1번에 최대 위 횟수. 자동 재시도·다음 페이지 없음. 같은 검색어는 30분 기억(서버 메모리), 동시 요청은 1번으로
 *  - 원본 응답은 저장하지 않고 압축한 결과만 생성 이력(context)에 남긴다
 *  - 실패해도 생성은 막지 않는다 (source = fallback_ai)
 */
export const keywordIntelConfig = {
  cacheMs: 30 * 60 * 1000,
  youtubeVideos: 25,
  naverPosts: 50,
  maxCandidates: 20,
  datalabTop: 5,
} as const;

const cache = new Map<string, { at: number; value: KeywordIntelligence }>();
const inFlight = new Map<string, Promise<KeywordIntelligence>>();

export function clearKeywordIntelCache(): void {
  cache.clear();
}

/* ── 검색어(Seed) 고르기: 기능별 우선순위, 1개만 ── */

const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "")).trim();

export function pickSeed(featureId: string, input: Record<string, unknown>, ctx: { productName?: string | null; trendTitle?: string | null; category?: string | null }): string {
  const candidates =
    featureId === "yt-product-video" || featureId === "clip-product-content"
      ? [first(input.keywords), ctx.productName, ctx.trendTitle]
      : featureId === "yt-info-video" || featureId === "clip-info-content"
        ? [first(input.keywords), String(input.topic ?? ""), ctx.trendTitle, ctx.category]
        : featureId === "blog-product-writing"
          ? [String(input.mainKeyword ?? ""), ctx.productName]
          : featureId === "blog-info-writing"
            ? [String(input.mainKeyword ?? ""), String(input.topic ?? ""), ctx.trendTitle]
            : featureId === "blog-auto-writing"
              ? [String(input.topic ?? "")]
              : [];
  return (candidates.map((c) => (c ?? "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "").slice(0, 40);
}

export const platformOf = (featureId: string): "youtube" | "naver" | null =>
  featureId.startsWith("yt-") ? "youtube" : featureId.startsWith("clip-") || featureId.startsWith("blog-") ? "naver" : null;

/* ── 후보 뽑기 (반복·태그·조회수·최근성) ── */

const STOP = new Set(
  "진짜 정말 완전 너무 그리고 하지만 그래서 있는 없는 하는 해서 에서 으로 에게 이거 그거 저거 오늘 지금 우리 여러분 영상 채널 구독 좋아요 알림 댓글 쇼츠 shorts the and for with you this that 및 등 더 또 수 것 중 vs".split(" "),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/#/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w));
const ngrams = (ws: string[]) => {
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= ws.length; i++) out.push(ws.slice(i, i + n).join(" "));
  return out;
};

type Doc = { title: string; body: string; tags: string[]; weight: number };

function extract(seed: string, docs: Doc[], source: KeywordCandidate["source"], sampleLabel: string): KeywordCandidate[] {
  const seedWords = new Set(words(seed));
  const stats = new Map<string, { score: number; inTitle: number; inTag: number; inBody: number }>();
  const bump = (k: string, field: "inTitle" | "inTag" | "inBody", w: number) => {
    const s = stats.get(k) ?? { score: 0, inTitle: 0, inTag: 0, inBody: 0 };
    s[field]++;
    s.score += w;
    stats.set(k, s);
  };
  for (const d of docs) {
    const seen = new Set<string>();
    for (const t of d.tags) {
      const k = words(t).join(" ");
      if (!k || seen.has(k)) continue;
      seen.add(k);
      bump(k, "inTag", 3 * d.weight);
    }
    for (const k of new Set(ngrams(words(d.title)))) bump(k, "inTitle", 2 * d.weight);
    for (const k of new Set(ngrams(words(d.body)))) bump(k, "inBody", 0.6 * d.weight);
  }
  const rows = [...stats.entries()]
    .filter(([k, s]) => s.inTitle + s.inTag >= 2 && k.length <= 25)
    // 검색어와 관련 있는 표현을 먼저 (검색어 단어를 포함하면 가산)
    .map(([k, s]) => ({ k, s, score: s.score * (k.split(" ").some((w) => seedWords.has(w)) ? 1.6 : 1) * (k.includes(" ") ? 1.15 : 1) }))
    .sort((a, b) => b.score - a.score);
  // 긴 표현이 짧은 표현을 거의 다 포함하면 짧은 것은 뺀다
  const picked: typeof rows = [];
  for (const r of rows) {
    if (picked.some((p) => p.k.includes(r.k) && p.score >= r.score * 0.7)) continue;
    picked.push(r);
    if (picked.length >= keywordIntelConfig.maxCandidates) break;
  }
  const max = picked[0]?.score || 1;
  return picked.map((r) => ({
    keyword: r.k,
    source,
    evidence: `${sampleLabel} 중 제목 ${r.s.inTitle}${r.s.inTag ? `·태그 ${r.s.inTag}` : ""}${r.s.inBody ? `·설명 ${r.s.inBody}` : ""}`,
    score: Math.round((r.score / max) * 100),
  }));
}

const recency = (iso: string | null) => {
  const t = iso ? Date.parse(iso.length === 8 ? `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}` : iso) : NaN;
  if (!Number.isFinite(t)) return 1;
  const days = (Date.now() - t) / 86_400_000;
  return days <= 30 ? 1.3 : days <= 180 ? 1.1 : 0.9;
};

async function fromYouTube(seed: string, requestId: string): Promise<KeywordIntelligence> {
  const yt = await getYouTubeTrendProvider();
  console.info("[KeywordIntel]", JSON.stringify({ requestId, platform: "youtube", calls: "search.list+videos.list", seed }));
  const videos: KeywordEvidenceVideo[] = await yt.keywordEvidence(seed, keywordIntelConfig.youtubeVideos);
  const docs = videos.map((v) => ({ title: v.title, body: v.description, tags: v.tags, weight: recency(v.publishedAt) * (1 + Math.log10((v.views ?? 0) + 10) / 6) }));
  return { seed, source: "youtube", sampleSize: videos.length, candidates: extract(seed, docs, "youtube", `관련 영상 ${videos.length}개`), trendSignals: [], fetchedAt: new Date().toISOString() };
}

async function fromNaver(seed: string, requestId: string): Promise<KeywordIntelligence> {
  const nv = await getNaverTrendProvider();
  console.info("[KeywordIntel]", JSON.stringify({ requestId, platform: "naver", calls: "blog-search+datalab", seed }));
  const posts: KeywordEvidencePost[] = await nv.blogEvidence(seed, keywordIntelConfig.naverPosts);
  const docs = posts.map((p) => ({ title: p.title, body: p.description, tags: [], weight: recency(p.postdate) }));
  const candidates = extract(seed, docs, "naver", `블로그 글 ${posts.length}개`);
  let trendSignals: KeywordTrendSignal[] = [];
  const top = [seed, ...candidates.map((c) => c.keyword).filter((k) => k !== seed)].slice(0, keywordIntelConfig.datalabTop);
  try {
    const rel = await nv.relativeInterest(top);
    trendSignals = Object.entries(rel).map(([keyword, r]) => ({
      keyword,
      relativeInterest: r.avg,
      direction: r.recent > r.previous * 1.15 ? "up" : r.recent < r.previous * 0.85 ? "down" : "flat",
    }));
  } catch {
    /* 데이터랩 실패는 후보만으로 */
  }
  return { seed, source: "naver", sampleSize: posts.length, candidates, trendSignals, fetchedAt: new Date().toISOString() };
}

export const keywordIntelligence = {
  /** 생성 1번에 한 번만 부른다 (2단계·추가 만들기는 저장된 결과를 재사용) */
  async collect(input: { userId: string; featureId: string; seed: string; requestId?: string }): Promise<KeywordIntelligence> {
    const platform = platformOf(input.featureId);
    const seed = input.seed.trim();
    const now = new Date().toISOString();
    if (!platform || !seed) return { seed, source: "fallback_ai", sampleSize: 0, candidates: [], trendSignals: [], fetchedAt: now, note: "검색어가 없어 AI 만으로 만듭니다." };
    const key = `${input.userId}:${platform}:${seed}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < keywordIntelConfig.cacheMs) return hit.value;
    const running = inFlight.get(key);
    if (running) return running;
    const p = (platform === "youtube" ? fromYouTube(seed, input.requestId ?? "-") : fromNaver(seed, input.requestId ?? "-"))
      .then((v) => {
        cache.set(key, { at: Date.now(), value: v });
        if (cache.size > 500) cache.delete(cache.keys().next().value!);
        return v;
      })
      .catch((e): KeywordIntelligence => ({
        seed,
        source: "fallback_ai",
        sampleSize: 0,
        candidates: [],
        trendSignals: [],
        fetchedAt: now,
        note: `${platform === "youtube" ? "YouTube" : "NAVER"} 데이터를 가져오지 못해 AI 만으로 만듭니다.${e instanceof Error ? ` (${e.message.slice(0, 80)})` : ""}`,
      }))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },
};
