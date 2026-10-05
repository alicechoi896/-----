import "server-only";
import type {
  SocialContinue,
  SocialPeriodOption,
  SocialPlatform,
  SocialQueryTranslation,
  SocialQueryType,
  SocialSearchResultDto,
  SocialSortOption,
  SocialVideoItem,
} from "@/lib/types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { rememberDouyinVideos } from "../providers/douyin/douyin-resolver";
import type { DouyinPublishTime, DouyinSort } from "../providers/douyin/types";
import { getAIProvider, getDouyinProvider } from "../providers/registry";
import { XhsSearchError } from "../providers/xiaohongshu/types";
import { getCurrentUserId } from "../repositories";
import { xhsSearchService } from "./xhs-search";

/**
 * 영상 검색 (샤오홍슈 또는 도우인 — 하나씩). docs/SOCIAL_VIDEO_SOURCING.md 「비용 정책」
 * - [검색] 1번 = TikHub 검색 API 1회. 업체가 한 번에 준 결과는 모두 보여 준다 (임의로 버리거나 count 를 늘리지 않음)
 * - 다음 페이지는 사용자가 [더 보기]를 누를 때만 1회. 자동 페이지 넘김·자동 추가 검색(보조어·영어)·두 플랫폼 동시 검색 없음
 * - 한국어는 기본 AI 로 중국어 1개로 바꿔 검색 (변환은 사용자별 서버 메모리에 기억 → 플랫폼을 바꿔도 다시 부르지 않음)
 * - 같은 조건(플랫폼·검색어·정렬·기간·페이지)은 30분 동안 다시 부르지 않는다 (화면 세션 기억 + 서버 메모리, DB 없음)
 * - 검색 결과·원본 응답은 저장하지 않는다. 도우인 결과의 재생 주소는 다운로드용 짧은 메모리 기억에만 넣는다
 */
export const socialVideoSearchConfig = {
  /** 같은 조건 검색 기억 (분) */
  searchCacheTtlMinutes: 30,
  /** 검색어 변환 기억 (분) */
  translationCacheTtlMinutes: 6 * 60,
  maxImportSelection: 20,
  recentDays: [7, 21, 30],
} as const;

export const SOCIAL_PLATFORMS: SocialPlatform[] = ["xiaohongshu", "douyin"];
const SORTS: SocialSortOption[] = ["general", "latest", "likes", "comments", "collects"];
const PERIODS: SocialPeriodOption[] = ["7", "21", "30", "all"];
const QUERY_TYPES: SocialQueryType[] = ["original", "translated"];

export const hasHangul = (s: string) => /[가-힣ㄱ-ㆎ]/.test(s);

/* ── 검색어 변환 (한국어 → 중국어 1개) ─────────── */

const translationCache = new Map<string, { at: number; value: string }>();
/** 진행 중인 요청 (같은 키가 동시에 들어오면 업체를 한 번만 부르고 결과를 나눠 쓴다) */
const inFlightTranslations = new Map<string, Promise<string>>();
const inFlightSearches = new Map<string, Promise<OnePage>>();

/** 같은 키의 진행 중인 Promise 를 재사용 (끝나면 지운다) */
function dedupe<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  const running = map.get(key);
  if (running) return running;
  const p = run().finally(() => map.delete(key));
  map.set(key, p);
  return p;
}

/** 업체 호출 기록 (민감정보 없음: 키·헤더·응답 본문은 남기지 않는다) */
function logUpstream(what: "tikhub-search" | "ai-translate", info: { requestId: string; platform?: string; query: string; page?: string | number }) {
  console.info(`[SocialSearch] ${what}`, JSON.stringify({ ...info, at: new Date().toISOString() }));
}

const cleanQuery = (v: unknown) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  // OR 문법·여러 검색어를 한 번에 넣지 않는다 (검색 1회 = 검색어 1개)
  return s && s.length <= 40 && !/\bOR\b|[|｜,，]/.test(s) ? s : null;
};

export async function translateQuery(userId: string, original: string, requestId = "-"): Promise<string> {
  const key = `${userId}::${original}`;
  const hit = translationCache.get(key);
  if (hit && Date.now() - hit.at < socialVideoSearchConfig.translationCacheTtlMinutes * 60_000) return hit.value;
  return dedupe(inFlightTranslations, key, () => translateNow(key, original, requestId));
}

async function translateNow(key: string, original: string, requestId: string): Promise<string> {
  logUpstream("ai-translate", { requestId, query: original });
  const template = getPromptTemplate("social.query-translate");
  const ai = await getAIProvider();
  const result = await ai.generateStructured<{ primary_zh?: unknown }>({
    task: "social-query-translate",
    messages: [
      { role: "system", content: template.system },
      { role: "user", content: `${template.task}\n[검색어] ${original}` },
    ],
    outputKeys: ["primary_zh"],
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["primary_zh"],
      properties: { primary_zh: { type: "string", description: "가장 자연스러운 간체 중국어 검색어 1개" } },
    },
    variables: { keyword: original },
    maxTokens: 120,
  });
  let zh = cleanQuery(result.data.primary_zh);
  if (!zh) throw new AppError("AI_BAD_OUTPUT", "검색어 자동 변환에 실패했습니다.", 502);
  // 영어·숫자 부분(모델명 등)은 그대로 남아야 한다 — AI 가 빠뜨리거나 바꿨으면 원문 그대로 붙인다
  for (const token of original.match(/[A-Za-z0-9][A-Za-z0-9+\-.]*/g) ?? []) {
    if (!zh.toLowerCase().includes(token.toLowerCase())) zh = `${zh} ${token}`;
  }
  zh = zh.slice(0, 60);
  translationCache.set(key, { at: Date.now(), value: zh });
  if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value!);
  return zh;
}

/* ── 플랫폼별 1회 검색 ─────────────────────── */

interface OnePage {
  items: SocialVideoItem[];
  calls: number;
  next: SocialContinue | null;
  filteredByDate: boolean;
}

async function searchXhs(userId: string, requestId: string, query: string, type: SocialQueryType, sort: SocialSortOption, period: SocialPeriodOption, from?: SocialContinue): Promise<OnePage> {
  const key = JSON.stringify(["xhs", userId, query, sort, period, from?.page ?? 1, from?.searchId ?? ""]);
  let mine = false;
  const value = await dedupe(inFlightSearches, key, () => {
    mine = true;
    return searchXhsNow(requestId, query, type, sort, period, from);
  });
  return mine ? value : { ...value, calls: 0 };
}

async function searchXhsNow(requestId: string, query: string, type: SocialQueryType, sort: SocialSortOption, period: SocialPeriodOption, from?: SocialContinue): Promise<OnePage> {
  // xhsSearchService 가 1페이지·30분 기억·21/30일 게시일 거르기를 맡는다 (기억된 결과면 업체 호출 0회 → onUpstream 안 불림)
  const res = await xhsSearchService.search({
    onUpstream: () => logUpstream("tikhub-search", { requestId, platform: "xiaohongshu", query, page: from?.page ?? 1 }),
    keyword: query,
    sort,
    period,
    cursor: from?.page ? { page: from.page, searchId: from.searchId, sessionId: from.sessionId } : null,
  });
  return {
    calls: res.calls,
    filteredByDate: res.filteredByDate,
    items: res.notes.map((n) => ({
      platform: "xiaohongshu",
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
      matchedQuery: query,
      queryType: type,
      previewUrl: n.previewUrl ?? null,
    })),
    next: res.next ? { query, queryType: type, page: res.next.page, searchId: res.next.searchId, sessionId: res.next.sessionId } : null,
  };
}

const douyinCache = new Map<string, { at: number; value: OnePage }>();
const DOUYIN_SORT: Record<SocialSortOption, DouyinSort> = { general: "general", latest: "latest", likes: "likes", comments: "general", collects: "general" };
/** 업체 기간: 7일은 그대로, 21·30일은 반년(180)으로 받아 게시일로 다시 거른다 (없는 값을 만들지 않는다) */
const douyinPublishTime = (p: SocialPeriodOption): DouyinPublishTime => (p === "7" ? "7" : p === "all" ? "0" : "180");

async function searchDouyin(userId: string, requestId: string, query: string, type: SocialQueryType, sort: SocialSortOption, period: SocialPeriodOption, from?: SocialContinue): Promise<OnePage> {
  const state = { cursor: Math.max(0, Number(from?.cursor) || 0), searchId: from?.searchId, backtrace: from?.backtrace };
  const key = JSON.stringify([userId, query, sort, period, state]);
  const hit = douyinCache.get(key);
  if (hit && Date.now() - hit.at < socialVideoSearchConfig.searchCacheTtlMinutes * 60_000) return { ...hit.value, calls: 0 };
  // 같은 요청이 동시에 들어오면 업체 호출 1회를 나눠 쓴다 (두 번째는 calls 0)
  let mine = false;
  const value = await dedupe(inFlightSearches, `dy:${key}`, () => {
    mine = true;
    return searchDouyinNow(key, requestId, query, type, sort, period, state);
  });
  return mine ? value : { ...value, calls: 0 };
}

async function searchDouyinNow(
  key: string,
  requestId: string,
  query: string,
  type: SocialQueryType,
  sort: SocialSortOption,
  period: SocialPeriodOption,
  state: { cursor: number; searchId?: string; backtrace?: string },
): Promise<OnePage> {
  const provider = await getDouyinProvider();
  logUpstream("tikhub-search", { requestId, platform: "douyin", query, page: state.cursor });
  const page = await provider.searchVideos({ keyword: query, sort: DOUYIN_SORT[sort], publishTime: douyinPublishTime(period), ...state });
  // 검색 응답에 재생 주소가 있으면 다운로드 때 다시 부르지 않게 짧게 기억 (DB 저장 안 함)
  rememberDouyinVideos(page.videos);
  const cutoff = period === "all" || period === "7" ? null : Date.now() - Number(period) * 86_400_000;
  const items: SocialVideoItem[] = [];
  const seen = new Set<string>();
  for (const v of page.videos) {
    const t = v.publishedAt ? Date.parse(v.publishedAt) : NaN;
    if (cutoff != null && !(Number.isFinite(t) && t >= cutoff)) continue;
    if (seen.has(v.awemeId)) continue;
    seen.add(v.awemeId);
    items.push({
      platform: "douyin",
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
      matchedQuery: query,
      queryType: type,
      previewUrl: v.playUrls[0] ?? null,
    });
  }
  const next: SocialContinue | null =
    page.hasMore && page.rawCount > 0
      ? { query, queryType: type, cursor: page.cursor ?? state.cursor + page.rawCount, searchId: page.searchId ?? state.searchId, backtrace: page.backtrace ?? state.backtrace }
      : null;
  const value: OnePage = { items, calls: 1, next, filteredByDate: cutoff != null };
  douyinCache.set(key, { at: Date.now(), value });
  if (douyinCache.size > 300) douyinCache.delete(douyinCache.keys().next().value!);
  return value;
}

function errorOf(platform: SocialPlatform, e: unknown): AppError {
  const name = platform === "douyin" ? "도우인" : "샤오홍슈";
  if (e instanceof AppError) return e;
  if (e instanceof XhsSearchError) {
    const status = { NOT_CONNECTED: 409, AUTH: 400, PAYMENT: 402, RATE_LIMIT: 429, TIMEOUT: 504, UPSTREAM: 502, BAD_RESPONSE: 502 }[e.code];
    return new AppError(`TIKHUB_${e.code}`, `${name} 검색에 실패했습니다. ${e.message}`, status);
  }
  return new AppError("TIKHUB_UPSTREAM", `${name} 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.`, 502);
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
    platform?: unknown;
    autoTranslate?: unknown;
    sort?: unknown;
    period?: unknown;
    /** [더 보기]: 지난 응답의 next 를 그대로 */
    next?: Partial<SocialContinue> | null;
    /** 화면에서 [검색]·[더 보기] 1번마다 만든 id (로그 추적용) */
    clientRequestId?: unknown;
  }): Promise<SocialSearchResultDto> {
    const requestId = typeof input.clientRequestId === "string" && /^[\w-]{1,60}$/.test(input.clientRequestId) ? input.clientRequestId : "-";
    const keyword = String(input.keyword ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!keyword) throw new AppError("VALIDATION", "검색어를 입력해 주세요.");
    const platform = SOCIAL_PLATFORMS.includes(input.platform as SocialPlatform) ? (input.platform as SocialPlatform) : null;
    if (!platform) throw new AppError("VALIDATION", "검색할 플랫폼(샤오홍슈·도우인)을 골라 주세요.");
    const sort = SORTS.includes(input.sort as SocialSortOption) ? (input.sort as SocialSortOption) : "general";
    const period = PERIODS.includes(input.period as SocialPeriodOption) ? (input.period as SocialPeriodOption) : "all";
    const userId = await getCurrentUserId();

    let translation: SocialQueryTranslation = { original: keyword, query: keyword, translated: false };
    let translationError: string | null = null;
    let from: SocialContinue | undefined;
    const n = input.next;
    if (n?.query) {
      // [더 보기]: 지난번에 실제로 검색한 말 그대로 (변환 다시 안 함)
      from = {
        query: String(n.query).slice(0, 60),
        queryType: QUERY_TYPES.includes(n.queryType as SocialQueryType) ? (n.queryType as SocialQueryType) : "original",
        page: n.page != null ? Math.max(1, Math.min(50, Number(n.page) || 1)) : undefined,
        cursor: n.cursor != null ? Math.max(0, Math.min(10_000, Number(n.cursor) || 0)) : undefined,
        searchId: n.searchId ? String(n.searchId).slice(0, 200) : undefined,
        sessionId: n.sessionId ? String(n.sessionId).slice(0, 200) : undefined,
        backtrace: n.backtrace ? String(n.backtrace).slice(0, 500) : undefined,
      };
      translation = { original: keyword, query: from.query, translated: from.queryType === "translated" };
    } else if (input.autoTranslate !== false && hasHangul(keyword)) {
      // 한국어만 AI 1회 (중국어·영어는 그대로)
      try {
        translation = { original: keyword, query: await translateQuery(userId, keyword, requestId), translated: true };
      } catch {
        translationError = "검색어 자동 변환에 실패했습니다. 입력한 검색어 그대로 검색했습니다.";
      }
    }
    const type: SocialQueryType = translation.translated ? "translated" : "original";
    try {
      const r =
        platform === "douyin"
          ? await searchDouyin(userId, requestId, translation.query, type, sort, period, from)
          : await searchXhs(userId, requestId, translation.query, type, sort, period, from);
      return { platform, translation, translationError, ...r };
    } catch (e) {
      throw errorOf(platform, e);
    }
  },
};
