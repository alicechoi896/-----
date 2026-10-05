import "server-only";
import type {
  SocialContinue,
  SocialPeriodOption,
  SocialPlatform,
  SocialPlatformResult,
  SocialQueryTranslation,
  SocialQueryType,
  SocialSearchResultDto,
  SocialSortOption,
  SocialVideoItem,
} from "@/lib/types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider, getDouyinProvider } from "../providers/registry";
import type { DouyinPublishTime, DouyinSearchPage, DouyinSort } from "../providers/douyin/types";
import { XhsSearchError } from "../providers/xiaohongshu/types";
import { getCurrentUserId } from "../repositories";
import { xhsSearchService } from "./xhs-search";

/**
 * 영상 검색 (샤오홍슈·도우인·둘 다). docs/SOCIAL_VIDEO_SOURCING.md
 * - 한국어 검색어는 기본 AI 로 한 번만 중국어로 바꾼다 (사용자별 서버 메모리에 기억, DB 저장 없음)
 * - 플랫폼마다 따로: 1순위 검색어 → 결과가 모자랄 때만 보조 → 그래도 모자라면 영어
 * - 둘 다: 번역 1번, 두 플랫폼을 동시에 검색. 한쪽이 실패해도 다른 쪽 결과는 보여준다
 * - 결과는 저장하지 않는다. 가져오기는 기존 videoService.importMany() (originalUrl)
 */
export const socialVideoSearchConfig = {
  /** 플랫폼별로 이만큼 모이면 다음 검색어(보조·영어)를 부르지 않는다 */
  minimumUsefulResults: 15,
  /** 검색어 하나당 최대 페이지 */
  maxPagesPerQuery: 3,
  maxImportSelection: 20,
  enableEnglishFallback: true,
  recentDays: [7, 21, 30],
  cacheMs: 10 * 60 * 1000,
  translationCacheMs: 6 * 60 * 60 * 1000,
} as const;

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["xiaohongshu", "douyin"];
const SORTS: SocialSortOption[] = ["general", "latest", "likes", "comments", "collects"];
const PERIODS: SocialPeriodOption[] = ["7", "21", "30", "all"];
const QUERY_TYPES: SocialQueryType[] = ["original", "primary", "alternate", "english"];

export const hasHangul = (s: string) => /[가-힣ㄱ-ㆎ]/.test(s);

/* ── 검색어 변환 ─────────────────────────────── */

const translationCache = new Map<string, { at: number; value: SocialQueryTranslation }>();

const cleanQuery = (v: unknown) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  // OR 문법·여러 검색어를 한 번에 넣지 않는다 (검색 1회 = 검색어 1개)
  return s && s.length <= 40 && !/\bOR\b|[|｜]/.test(s) ? s : null;
};

export async function translateQuery(userId: string, original: string): Promise<SocialQueryTranslation> {
  const key = `${userId}::${original}`;
  const hit = translationCache.get(key);
  if (hit && Date.now() - hit.at < socialVideoSearchConfig.translationCacheMs) return hit.value;
  const template = getPromptTemplate("social.query-translate");
  const ai = await getAIProvider();
  const result = await ai.generateStructured<{ original?: unknown; primary_zh?: unknown; alternate_zh?: unknown; english?: unknown }>({
    task: "social-query-translate",
    messages: [
      { role: "system", content: template.system },
      { role: "user", content: `${template.task}\n[검색어] ${original}` },
    ],
    outputKeys: ["original", "primary_zh", "alternate_zh", "english"],
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["original", "primary_zh", "alternate_zh", "english"],
      properties: {
        original: { type: "string" },
        primary_zh: { type: "string", description: "가장 자연스러운 간체 중국어 검색어 1개" },
        alternate_zh: { type: "string", description: "다른 표현의 간체 중국어 검색어 1개 (브랜드 다른 표기 등)" },
        english: { type: "string", description: "영어 검색어 1개" },
      },
    },
    variables: { keyword: original },
    maxTokens: 200,
  });
  const primaryZh = cleanQuery(result.data.primary_zh);
  if (!primaryZh) throw new AppError("AI_BAD_OUTPUT", "검색어 자동 변환에 실패했습니다.", 502);
  const alternate = cleanQuery(result.data.alternate_zh);
  const english = cleanQuery(result.data.english);
  const value: SocialQueryTranslation = {
    original,
    primaryZh,
    alternateZh: alternate && alternate !== primaryZh ? alternate : null,
    english: english && english !== primaryZh ? english : null,
    translated: true,
  };
  translationCache.set(key, { at: Date.now(), value });
  if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value!);
  return value;
}

/** 검색어 순서: 변환했으면 1순위 → 보조 → 영어, 아니면 입력 그대로 하나 */
export function queryPlan(t: SocialQueryTranslation, englishFallback: boolean = socialVideoSearchConfig.enableEnglishFallback) {
  if (!t.translated) return [{ query: t.original, type: "original" as SocialQueryType }];
  const plan: { query: string; type: SocialQueryType }[] = [];
  if (t.primaryZh) plan.push({ query: t.primaryZh, type: "primary" });
  if (t.alternateZh) plan.push({ query: t.alternateZh, type: "alternate" });
  if (englishFallback && t.english) plan.push({ query: t.english, type: "english" });
  return plan.length ? plan : [{ query: t.original, type: "original" as SocialQueryType }];
}

/* ── 플랫폼별 한 검색어 ─────────────────────── */

interface QueryPage {
  items: SocialVideoItem[];
  calls: number;
  next: SocialContinue | null;
}

const blankItem = (platform: SocialPlatform, query: string, type: SocialQueryType) => ({ platform, matchedQuery: query, queryType: type, similarGroup: null });

async function searchXhs(query: string, type: SocialQueryType, sort: SocialSortOption, period: SocialPeriodOption, from?: SocialContinue): Promise<QueryPage> {
  const res = await xhsSearchService.search({
    keyword: query,
    sort,
    period,
    cursor: from?.page ? { page: from.page, searchId: from.searchId, sessionId: from.sessionId } : null,
  });
  return {
    calls: res.calls,
    items: res.notes.map((n) => ({
      ...blankItem("xiaohongshu", query, type),
      sourceId: n.noteId,
      title: n.title,
      desc: n.desc,
      authorName: n.author,
      thumbnailUrl: n.coverUrl,
      originalUrl: n.url,
      publishedAt: n.publishedAt,
      durationSec: n.durationSec,
      likeCount: n.likes,
      commentCount: n.comments,
      collectCount: n.collects,
      shareCount: null,
    })),
    next: res.next ? { query, queryType: type, page: res.next.page, searchId: res.next.searchId, sessionId: res.next.sessionId } : null,
  };
}

const douyinCache = new Map<string, { at: number; value: QueryPage }>();
const DOUYIN_SORT: Record<SocialSortOption, DouyinSort> = { general: "general", latest: "latest", likes: "likes", comments: "general", collects: "general" };
/** 업체 기간: 7일은 그대로, 21·30일은 반년(180)으로 받아 게시일로 다시 거른다 */
const douyinPublishTime = (p: SocialPeriodOption): DouyinPublishTime => (p === "7" ? "7" : p === "all" ? "0" : "180");

async function searchDouyin(userId: string, query: string, type: SocialQueryType, sort: SocialSortOption, period: SocialPeriodOption, from?: SocialContinue): Promise<QueryPage> {
  const start = { cursor: Math.max(0, Number(from?.cursor) || 0), searchId: from?.searchId, backtrace: from?.backtrace };
  const key = JSON.stringify([userId, query, sort, period, start]);
  const hit = douyinCache.get(key);
  if (hit && Date.now() - hit.at < socialVideoSearchConfig.cacheMs) return { ...hit.value, calls: 0 };
  const provider = await getDouyinProvider();
  const cutoff = period === "all" || period === "7" ? null : Date.now() - Number(period) * 86_400_000;
  const items: SocialVideoItem[] = [];
  const seen = new Set<string>();
  let state: typeof start | null = start;
  let calls = 0;
  while (state && calls < socialVideoSearchConfig.maxPagesPerQuery && items.length < socialVideoSearchConfig.minimumUsefulResults) {
    const page: DouyinSearchPage = await provider.searchVideos({ keyword: query, sort: DOUYIN_SORT[sort], publishTime: douyinPublishTime(period), ...state });
    calls++;
    let olderOnly: boolean = page.videos.length > 0;
    for (const v of page.videos) {
      const t = v.publishedAt ? Date.parse(v.publishedAt) : NaN;
      const inRange = cutoff == null || (Number.isFinite(t) && t >= cutoff);
      if (inRange) olderOnly = false;
      if (!inRange || seen.has(v.awemeId)) continue;
      seen.add(v.awemeId);
      items.push({
        ...blankItem("douyin", query, type),
        sourceId: v.awemeId,
        title: v.title,
        desc: v.desc,
        authorName: v.author,
        thumbnailUrl: v.coverUrl,
        originalUrl: v.shareUrl,
        publishedAt: v.publishedAt,
        durationSec: v.durationSec,
        likeCount: v.likes,
        commentCount: v.comments,
        collectCount: v.collects,
        shareCount: v.shares,
      });
    }
    const nextCursor: number = page.cursor ?? state.cursor + page.rawCount;
    const next: typeof start | null =
      page.hasMore && page.rawCount > 0 ? { cursor: nextCursor, searchId: page.searchId ?? state.searchId, backtrace: page.backtrace ?? state.backtrace } : null;
    state = sort === "latest" && cutoff != null && olderOnly ? null : next;
  }
  const value: QueryPage = { items, calls, next: state ? { query, queryType: type, ...state } : null };
  douyinCache.set(key, { at: Date.now(), value });
  if (douyinCache.size > 300) douyinCache.delete(douyinCache.keys().next().value!);
  return value;
}

/* ── 플랫폼 하나: 검색어를 차례로 (모자랄 때만 다음) ── */

function errorOf(platform: SocialPlatform, e: unknown): { code: string; message: string } {
  const name = platform === "douyin" ? "도우인" : "샤오홍슈";
  if (e instanceof XhsSearchError) return { code: `TIKHUB_${e.code}`, message: `${name} 검색에 실패했습니다. ${e.message}` };
  if (e instanceof AppError) return { code: e.code, message: `${name} 검색에 실패했습니다. ${e.message}` };
  return { code: "TIKHUB_UPSTREAM", message: `${name} 검색에 실패했습니다.` };
}

export async function searchPlatform(
  userId: string,
  platform: SocialPlatform,
  plan: { query: string; type: SocialQueryType }[],
  sort: SocialSortOption,
  period: SocialPeriodOption,
  from?: SocialContinue,
): Promise<SocialPlatformResult> {
  const out: SocialPlatformResult = { platform, items: [], error: null, calls: 0, queriesUsed: [], next: null };
  const seen = new Set<string>();
  // [더 보기]: 이어서 그 검색어만 한 번 더
  const steps = from ? [{ query: from.query, type: from.queryType }] : plan;
  for (const step of steps) {
    try {
      const res =
        platform === "douyin"
          ? await searchDouyin(userId, step.query, step.type, sort, period, from)
          : await searchXhs(step.query, step.type, sort, period, from);
      out.calls += res.calls;
      let added = 0;
      for (const it of res.items) {
        const k = `${it.platform}:${it.sourceId}`; // 1순위·보조 결과에 같은 영상이 있으면 하나만
        if (seen.has(k)) continue;
        seen.add(k);
        out.items.push(it);
        added++;
      }
      out.queriesUsed.push({ query: step.query, type: step.type, count: added });
      out.next = res.next;
    } catch (e) {
      // 첫 검색어부터 실패하면 이 플랫폼은 오류. 보조 검색어에서 실패하면 받은 결과는 그대로 둔다
      if (!out.items.length) out.error = errorOf(platform, e);
      break;
    }
    if (out.items.length >= socialVideoSearchConfig.minimumUsefulResults) break;
  }
  return out;
}

/* ── 다른 플랫폼의 비슷한 영상 (지우지 않고 표시만) ── */

const bigrams = (s: string) => {
  const t = s.toLowerCase().replace(/[\s#@·,.!?，。！？【】\[\]()（）]+/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};

export function markSimilar(results: SocialPlatformResult[]): void {
  const [a, b] = results;
  if (!a || !b) return;
  let group = 0;
  const grams = new Map<SocialVideoItem, Set<string>>();
  // 검색어 자체는 모든 제목에 겹치므로 빼고 비교한다 (안 그러면 거의 다 비슷해 보인다)
  const g = (it: SocialVideoItem) => grams.get(it) ?? grams.set(it, bigrams(it.title.split(it.matchedQuery).join(" "))).get(it)!;
  for (const x of a.items) {
    for (const y of b.items) {
      if (y.similarGroup) continue;
      const sameLength = x.durationSec != null && y.durationSec != null && Math.abs(x.durationSec - y.durationSec) <= 2;
      if (!sameLength) continue;
      const gx = g(x);
      const gy = g(y);
      if (gx.size < 5 || gy.size < 5) continue;
      let inter = 0;
      for (const k of gx) if (gy.has(k)) inter++;
      if (inter / Math.min(gx.size, gy.size) >= 0.7) {
        const id = x.similarGroup ?? `sim${++group}`;
        x.similarGroup = id;
        y.similarGroup = id;
      }
    }
  }
}

/** 서버 메모리 기억 비우기 (테스트용) */
export function clearSocialSearchCache(): void {
  douyinCache.clear();
  translationCache.clear();
}

/* ── 검색 ─────────────────────────────────── */

export const socialSearchService = {
  async search(input: {
    keyword?: unknown;
    platforms?: unknown;
    autoTranslate?: unknown;
    sort?: unknown;
    period?: unknown;
    /** [더 보기]: 한 플랫폼만 이어서 */
    continue?: { platform?: unknown; next?: Partial<SocialContinue> } | null;
  }): Promise<SocialSearchResultDto> {
    const keyword = String(input.keyword ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!keyword) throw new AppError("VALIDATION", "검색어를 입력해 주세요.");
    const sort = SORTS.includes(input.sort as SocialSortOption) ? (input.sort as SocialSortOption) : "general";
    const period = PERIODS.includes(input.period as SocialPeriodOption) ? (input.period as SocialPeriodOption) : "all";
    const userId = await getCurrentUserId();

    // [더 보기]: 번역·다른 플랫폼 호출 없이 그 플랫폼·그 검색어만
    const cont = input.continue;
    if (cont && SOCIAL_PLATFORMS.includes(cont.platform as SocialPlatform) && cont.next?.query) {
      const n = cont.next;
      const from: SocialContinue = {
        query: String(n.query).slice(0, 60),
        queryType: QUERY_TYPES.includes(n.queryType as SocialQueryType) ? (n.queryType as SocialQueryType) : "original",
        page: n.page != null ? Math.max(1, Math.min(50, Number(n.page) || 1)) : undefined,
        cursor: n.cursor != null ? Math.max(0, Math.min(10_000, Number(n.cursor) || 0)) : undefined,
        searchId: n.searchId ? String(n.searchId).slice(0, 200) : undefined,
        sessionId: n.sessionId ? String(n.sessionId).slice(0, 200) : undefined,
        backtrace: n.backtrace ? String(n.backtrace).slice(0, 500) : undefined,
      };
      const r = await searchPlatform(userId, cont.platform as SocialPlatform, [], sort, period, from);
      return { translation: { original: keyword, primaryZh: null, alternateZh: null, english: null, translated: false }, translationError: null, platforms: [r] };
    }

    const platforms = (Array.isArray(input.platforms) ? input.platforms : ["xiaohongshu"]).filter((p): p is SocialPlatform => SOCIAL_PLATFORMS.includes(p as SocialPlatform));
    if (!platforms.length) throw new AppError("VALIDATION", "검색할 플랫폼을 골라 주세요.");
    const unique = [...new Set(platforms)];

    // 한국어가 있고 자동 변환을 켰을 때만 AI 1회 (중국어·영어 입력은 그대로 검색)
    let translation: SocialQueryTranslation = { original: keyword, primaryZh: null, alternateZh: null, english: null, translated: false };
    let translationError: string | null = null;
    if (input.autoTranslate !== false && hasHangul(keyword)) {
      try {
        translation = await translateQuery(userId, keyword);
      } catch {
        translationError = "검색어 자동 변환에 실패했습니다. 입력한 검색어 그대로 검색했습니다.";
      }
    }
    const plan = queryPlan(translation);
    const settled = await Promise.allSettled(unique.map((p) => searchPlatform(userId, p, plan, sort, period)));
    const results = settled.map((s, i) =>
      s.status === "fulfilled" ? s.value : { platform: unique[i], items: [], error: errorOf(unique[i], s.reason), calls: 0, queriesUsed: [], next: null },
    );
    markSimilar(results);
    return { translation, translationError, platforms: results };
  },
};
