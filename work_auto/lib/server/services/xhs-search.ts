import "server-only";
import { AppError } from "../http";
import { getXiaohongshuSearchProvider } from "../providers/registry";
import { XhsSearchError, type XhsNote, type XhsSearchPage, type XhsSort, type XhsTimeFilter } from "../providers/xiaohongshu/types";
import { getCurrentUserId } from "../repositories";

/**
 * 샤오홍슈 영상 검색 (영상 URL 가져오기 › [영상 검색], social-search.ts 가 부른다). docs/SOCIAL_VIDEO_SOURCING.md
 * - 검색 결과는 DB 에 저장하지 않는다 (서버 메모리에 30분, 같은 조건 재검색 비용 절약)
 * - 가져오기는 기존 videoService.importMany() 를 그대로 쓴다 (화면이 원본 URL 을 넘긴다)
 * - 검색 1번 = 검색 API 1회 (자동 페이지 넘김 없음). 상세 API 는 부르지 않는다 (검색 응답의 값으로 저장)
 */
export const XHS_SEARCH_CONFIG = {
  /** [검색]·[더 보기] 한 번 = 검색 API 1회 (자동으로 다음 페이지를 부르지 않는다, v0.9.32 비용 정책) */
  maxPages: 1,
  /** 업체가 한 페이지에 준 결과는 모두 쓴다 (개수로 끊지 않음) */
  targetResults: Number.POSITIVE_INFINITY,
  /** 같은 조건은 30분 동안 다시 부르지 않는다 (socialVideoSearchConfig.searchCacheTtlMinutes 와 같게) */
  cacheMs: 30 * 60 * 1000,
} as const;

export type XhsPeriod = "7" | "21" | "30" | "all";
export const XHS_SORTS: XhsSort[] = ["general", "latest", "likes", "comments", "collects"];
export const XHS_PERIODS: XhsPeriod[] = ["7", "21", "30", "all"];

export interface XhsCursor {
  page: number;
  searchId?: string;
  sessionId?: string;
}
export interface XhsSearchResult {
  notes: XhsNote[];
  next: XhsCursor | null;
  /** 이번에 TikHub 를 부른 횟수 (화면 안내·비용 확인용) */
  calls: number;
  /** 21·30일처럼 업체에 정확한 필터가 없어 게시일로 다시 거른 경우 */
  filteredByDate: boolean;
}

/** 업체 필터: 7일은 그대로, 21·30일은 '반년 이내'로 받아 게시일로 다시 거른다 (없는 파라미터를 만들지 않는다) */
function timeFilterOf(period: XhsPeriod): XhsTimeFilter {
  return period === "7" ? "week" : period === "all" ? "all" : "half-year";
}

const cache = new Map<string, { at: number; value: XhsSearchResult }>();

function toAppError(e: unknown): never {
  if (e instanceof AppError) throw e;
  if (e instanceof XhsSearchError) {
    const status = { NOT_CONNECTED: 409, AUTH: 400, PAYMENT: 402, RATE_LIMIT: 429, TIMEOUT: 504, UPSTREAM: 502, BAD_RESPONSE: 502 }[e.code];
    throw new AppError(`TIKHUB_${e.code}`, e.message, status);
  }
  throw new AppError("TIKHUB_UPSTREAM", "샤오홍슈 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
}

/** 테스트용: 서버 메모리 기억 비우기 */
export function xhsSearchServiceCacheClear(): void {
  cache.clear();
}

export const xhsSearchService = {
  async search(input: { keyword?: unknown; sort?: unknown; period?: unknown; cursor?: Partial<XhsCursor> | null }): Promise<XhsSearchResult> {
    const keyword = String(input.keyword ?? "").trim().slice(0, 60);
    if (!keyword) throw new AppError("VALIDATION", "검색어를 입력해 주세요.");
    const sort = XHS_SORTS.includes(input.sort as XhsSort) ? (input.sort as XhsSort) : "general";
    const period = XHS_PERIODS.includes(input.period as XhsPeriod) ? (input.period as XhsPeriod) : "all";
    const start: XhsCursor = {
      page: Math.max(1, Math.min(50, Number(input.cursor?.page) || 1)),
      searchId: input.cursor?.searchId ? String(input.cursor.searchId).slice(0, 200) : undefined,
      sessionId: input.cursor?.sessionId ? String(input.cursor.sessionId).slice(0, 200) : undefined,
    };
    const userId = await getCurrentUserId();
    const key = JSON.stringify([userId, keyword, sort, period, start]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < XHS_SEARCH_CONFIG.cacheMs) return { ...hit.value, calls: 0 };

    const provider = await getXiaohongshuSearchProvider().catch(toAppError);
    const cutoff = period === "all" || period === "7" ? null : Date.now() - Number(period) * 86_400_000;
    const notes: XhsNote[] = [];
    const seen = new Set<string>();
    let cursor: XhsCursor | null = start;
    let calls = 0;
    while (cursor && calls < XHS_SEARCH_CONFIG.maxPages && notes.length < XHS_SEARCH_CONFIG.targetResults) {
      const page: XhsSearchPage = await provider
        .searchVideos({ keyword, sort, timeFilter: timeFilterOf(period), page: cursor.page, searchId: cursor.searchId, sessionId: cursor.sessionId })
        .catch(toAppError);
      calls++;
      let olderOnly: boolean = page.notes.length > 0;
      for (const n of page.notes) {
        const t = n.publishedAt ? Date.parse(n.publishedAt) : NaN;
        const inRange = cutoff == null || (Number.isFinite(t) && t >= cutoff);
        if (inRange) olderOnly = false;
        if (inRange && !seen.has(n.noteId)) {
          seen.add(n.noteId);
          notes.push(n);
        }
      }
      const next: XhsCursor | null = page.hasMore && page.rawCount > 0 ? { page: cursor.page + 1, searchId: page.searchId ?? cursor.searchId, sessionId: page.sessionId ?? cursor.sessionId } : null;
      // 최신순인데 이 페이지가 모두 기간 밖이면 더 불러도 기간 밖이다
      cursor = sort === "latest" && cutoff != null && olderOnly ? null : next;
    }
    const value: XhsSearchResult = { notes, next: cursor, calls, filteredByDate: cutoff != null };
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return value;
  },
};
