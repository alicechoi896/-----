import "server-only";
import type { IgMetaKind, IgSearchResult, IgSource, IgSourceStatus } from "@/lib/types/instagram";
import { AppError } from "../http";
import { MetaGraphError, toHashtag } from "../providers/instagram/meta-graph";
import { getInstagramProvider, getMetaInstagramProvider, hasTikHub } from "../providers/registry";
import { XhsSearchError } from "../providers/xiaohongshu/types";
import { getCurrentUserId } from "../repositories";

/**
 * 인스타그램 트렌드 찾기 (v0.9.53, v0.9.57 공식 API 병행). docs/INSTAGRAM_TRENDS.md
 * - source "meta": Instagram 공식 API (무료, 해시태그만, 7일에 서로 다른 해시태그 30개, 조회수 없음) ← 기본
 * - source "tikhub": 키워드·조회수가 필요할 때 사용자가 고를 때만 (자동으로 넘어가지 않는다)
 * - [검색] 1번 = TikHub 1회(약 $0.01). [더 보기] 1번 = 1회. 자동 재시도·자동 다음 페이지 없음
 * - 같은 사용자·검색어·페이지는 30분 기억(0회), 동시에 같은 요청은 1번으로 합친다
 * - 결과는 저장하지 않는다. 화면에서 [대본 포맷에 담기]·[영상 만들기]로 이어 간다
 */
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: Omit<IgSearchResult, "calls"> }>();
const metaCache = new Map<string, { at: number; value: Omit<IgSearchResult, "calls"> }>();
const inFlight = new Map<string, Promise<Omit<IgSearchResult, "calls">>>();

export function clearInstagramCache() {
  cache.clear();
  metaCache.clear();
}

function errorOf(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof MetaGraphError) {
    const status = { AUTH: 400, PERMISSION: 403, QUOTA: 429, RATE_LIMIT: 429, NOT_FOUND: 404, TIMEOUT: 504, UPSTREAM: 502 }[e.code];
    return new AppError(`META_${e.code}`, e.message, status);
  }
  if (e instanceof XhsSearchError) {
    const status = { NOT_CONNECTED: 409, AUTH: 400, PAYMENT: 402, RATE_LIMIT: 429, TIMEOUT: 504, UPSTREAM: 502, BAD_RESPONSE: 502 }[e.code];
    return new AppError(`TIKHUB_${e.code}`, `인스타그램 검색에 실패했습니다. ${e.message}`, status);
  }
  return new AppError("TIKHUB_UPSTREAM", "인스타그램 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.", 502);
}

const mediaCache = new Map<string, { at: number; url: string | null }>();
const MEDIA_MS = 20 * 60 * 1000;

export const instagramTrendService = {
  /** 어떤 검색을 쓸 수 있는지 (DB 만, 외부 호출 없음) */
  async status(): Promise<IgSourceStatus> {
    const [meta, tikhub] = await Promise.all([getMetaInstagramProvider().catch(() => null), hasTikHub()]);
    return { meta: Boolean(meta), tikhub };
  },

  /** 재생 주소 (검색 결과에 없을 때만, ▶ 1번 = TikHub 1회 · 같은 릴스 20분 기억) */
  async media(input: { code?: unknown }): Promise<{ videoUrl: string | null; calls: number }> {
    const code = String(input.code ?? "");
    if (!/^[\w-]{5,40}$/.test(code)) throw new AppError("VALIDATION", "릴스 코드가 올바르지 않습니다.");
    const hit = mediaCache.get(code);
    if (hit && Date.now() - hit.at < MEDIA_MS) return { videoUrl: hit.url, calls: 0 };
    try {
      const provider = await getInstagramProvider();
      const reel = await provider.fetchReel(code);
      const url = reel?.videoUrl ?? null;
      mediaCache.set(code, { at: Date.now(), url });
      if (mediaCache.size > 500) mediaCache.delete(mediaCache.keys().next().value!);
      return { videoUrl: url, calls: 1 };
    } catch (e) {
      throw errorOf(e);
    }
  },

  /** 공식 API 해시태그 검색 (무료). 같은 사용자·해시태그·페이지 30분 기억. 한도를 다 쓰면 META_QUOTA (TikHub 로 자동으로 넘어가지 않음) */
  async searchMeta(keyword: string, next: string | null, kind: IgMetaKind, clientRequestId: string): Promise<IgSearchResult> {
    const hashtag = toHashtag(keyword);
    if (!hashtag) throw new AppError("VALIDATION", "해시태그로 찾을 글자가 없습니다. 한글·영문·숫자로 넣어 주세요.");
    const provider = await getMetaInstagramProvider();
    if (!provider) throw new AppError("META_NOT_CONNECTED", "Instagram 공식 API 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 연결하거나 TikHub 로 찾아 주세요.", 409);
    const userId = await getCurrentUserId();
    const key = `${userId}:${kind}:${hashtag.toLowerCase()}:${next ?? ""}`;
    const hit = metaCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, calls: 0 };
    const running = inFlight.get(`meta:${key}`);
    if (running) return { ...(await running), calls: 0 };
    const p = (async () => {
      const t0 = Date.now();
      const r = await provider.searchHashtag(hashtag, next, kind);
      console.info("[IgMeta]", JSON.stringify({ clientRequestId, hashtag, kind, page: next ? "next" : "first", ms: Date.now() - t0, items: r.items.length, skipped: r.skipped, hasNext: Boolean(r.next), quota: r.quota.used, newHashtag: r.newHashtag }));
      return { keyword, source: "meta" as const, hashtag, quota: r.quota, skipped: r.skipped, items: r.items, next: r.next };
    })()
      .then((v) => {
        metaCache.set(key, { at: Date.now(), value: v });
        if (metaCache.size > 500) metaCache.delete(metaCache.keys().next().value!);
        return v;
      })
      .finally(() => inFlight.delete(`meta:${key}`));
    inFlight.set(`meta:${key}`, p);
    try {
      return { ...(await p), calls: 1 };
    } catch (e) {
      throw errorOf(e);
    }
  },

  async search(input: { keyword?: unknown; next?: unknown; clientRequestId?: unknown; source?: unknown; kind?: unknown }): Promise<IgSearchResult> {
    const keyword = String(input.keyword ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!keyword) throw new AppError("VALIDATION", "검색어를 입력해 주세요.");
    const next = typeof input.next === "string" && input.next ? input.next.slice(0, 500) : null;
    const source: IgSource = input.source === "tikhub" ? "tikhub" : "meta";
    const kind: IgMetaKind = input.kind === "recent" ? "recent" : "top";
    if (source === "meta") return this.searchMeta(keyword, next, kind, String(input.clientRequestId ?? "-").slice(0, 40));
    const userId = await getCurrentUserId();
    const key = `${userId}:${keyword.toLowerCase()}:${next ?? ""}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, calls: 0 };
    const running = inFlight.get(key);
    if (running) return { ...(await running), calls: 0 };
    const p = (async () => {
      const provider = await getInstagramProvider();
      const t0 = Date.now();
      const r = await provider.searchReels(keyword, next);
      // 진단: 걸린 시간·받은 수·다음 페이지·응답 모양(키 이름만, 값 없음)
      console.info("[IgSearch]", JSON.stringify({ clientRequestId: String(input.clientRequestId ?? "-").slice(0, 40), keyword, page: next ? "next" : "first", ms: Date.now() - t0, items: r.items.length, hasNext: Boolean(r.next), shape: r.shape?.slice(0, 400) }));
      return { keyword, source: "tikhub" as const, items: r.items, next: r.next };
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
