import "server-only";
import type { IgSearchResult } from "@/lib/types/instagram";
import { AppError } from "../http";
import { getInstagramProvider } from "../providers/registry";
import { XhsSearchError } from "../providers/xiaohongshu/types";
import { getCurrentUserId } from "../repositories";

/**
 * 인스타그램 트렌드 찾기 (v0.9.53). docs/INSTAGRAM_TRENDS.md
 * - [검색] 1번 = TikHub 1회(약 $0.01). [더 보기] 1번 = 1회. 자동 재시도·자동 다음 페이지 없음
 * - 같은 사용자·검색어·페이지는 30분 기억(0회), 동시에 같은 요청은 1번으로 합친다
 * - 결과는 저장하지 않는다. 화면에서 [대본 포맷에 담기]·[영상 만들기]로 이어 간다
 */
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: Omit<IgSearchResult, "calls"> }>();
const inFlight = new Map<string, Promise<Omit<IgSearchResult, "calls">>>();

export function clearInstagramCache() {
  cache.clear();
}

function errorOf(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof XhsSearchError) {
    const status = { NOT_CONNECTED: 409, AUTH: 400, PAYMENT: 402, RATE_LIMIT: 429, TIMEOUT: 504, UPSTREAM: 502, BAD_RESPONSE: 502 }[e.code];
    return new AppError(`TIKHUB_${e.code}`, `인스타그램 검색에 실패했습니다. ${e.message}`, status);
  }
  return new AppError("TIKHUB_UPSTREAM", "인스타그램 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
}

export const instagramTrendService = {
  async search(input: { keyword?: unknown; next?: unknown; clientRequestId?: unknown }): Promise<IgSearchResult> {
    const keyword = String(input.keyword ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!keyword) throw new AppError("VALIDATION", "검색어를 입력해 주세요.");
    const next = typeof input.next === "string" && input.next ? input.next.slice(0, 500) : null;
    const userId = await getCurrentUserId();
    const key = `${userId}:${keyword.toLowerCase()}:${next ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, calls: 0 };
    const running = inFlight.get(key);
    if (running) return { ...(await running), calls: 0 };
    const p = (async () => {
      const provider = await getInstagramProvider();
      console.info("[IgSearch]", JSON.stringify({ clientRequestId: String(input.clientRequestId ?? "-").slice(0, 40), keyword, page: next ? "next" : "first" }));
      const r = await provider.searchReels(keyword, next);
      return { keyword, items: r.items, next: r.next };
    })()
      .then((v) => {
        cache.set(key, { at: Date.now(), value: v });
        if (cache.size > 500) cache.delete(cache.keys().next().value!);
        return v;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    try {
      return { ...(await p), calls: 1 };
    } catch (e) {
      throw errorOf(e);
    }
  },
};
