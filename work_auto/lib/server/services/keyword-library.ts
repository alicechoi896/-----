import "server-only";
import type { KeywordOrigin, KeywordTrend, TrendKeyword, TrendKeywordView } from "@/lib/types/keyword-library";
import { KEYWORD_LIFETIME_DAYS } from "@/lib/types/keyword-library";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getNaverTrendProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";

/**
 * 키워드 관리 (v0.9.56). docs/KEYWORD_LIBRARY.md
 * - 자동 수집(ingest): 트렌드 찾기·Keyword Intelligence·스크랩이 이미 받은 데이터로. 외부 호출 0, 실패해도 원래 기능은 막지 않는다
 * - 같은 말 묶음(norm): 띄어쓰기·대소문자·순서·'프로/Pro'·'맥스/Max' 등을 무시 → "아이폰18프로" = "아이폰 Pro18" = "iPhone 18 Pro"
 * - 만료: 마지막으로 본 날 + 180일 지나면 보관함 (고정 제외, 지우지 않음). 목록을 열 때 정리
 * - 상승·하락: 최근 2주 본 횟수 vs 그 전 2주. 데이터랩 상대 관심도는 [관심도 갱신](최대 5개 = NAVER 1회)으로만
 */
const DAY = 86_400_000;
const MAX_WEEKS = 26;

const STOP = new Set(
  "추천 꿀팁 리뷰 후기 shorts short 쇼츠 릴스 reels 영상 브이로그 vlog 일상 오늘 진짜 정말 이거 그거 신상 인기 꿀템 광고 협찬 fyp foryou 좋아요 구독 팔로우 the and for with".split(" "),
);
const SYNONYM: [RegExp, string][] = [
  [/iphone/g, "아이폰"],
  [/galaxy/g, "갤럭시"],
  [/airpods?/g, "에어팟"],
  [/ipad/g, "아이패드"],
  [/macbook/g, "맥북"],
  [/프로/g, "pro"],
  [/맥스/g, "max"],
  [/울트라/g, "ultra"],
  [/플러스/g, "plus"],
  [/미니/g, "mini"],
];

/** 같은 말 묶음 키: 소문자·동의어 → 한글/영문/숫자 덩어리로 나눠 정렬 */
export function normalizeKeyword(raw: string): string {
  let s = raw.toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  for (const [re, to] of SYNONYM) s = s.replace(re, ` ${to} `);
  const parts = s.match(/[a-z]+|\d+|[\p{Script=Hangul}]+|[\p{L}]+/gu) ?? [];
  return [...parts].sort().join(" ");
}

/** 자동 수집에서 뺄 말 */
export function isUsefulKeyword(raw: string): boolean {
  const k = raw.replace(/^#/, "").trim();
  if (k.length < 2 || k.length > 30) return false;
  if (/^\d+$/.test(k) || /https?:|www\./i.test(k)) return false;
  return !STOP.has(k.toLowerCase());
}

export function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
const weeksAgo = (n: number) => isoWeek(new Date(Date.now() - n * 7 * DAY));

export function trendOf(k: Pick<TrendKeyword, "weeks" | "firstSeenAt">): { trend: KeywordTrend; recent: number } {
  const w = k.weeks ?? {};
  const recent = (w[weeksAgo(0)] ?? 0) + (w[weeksAgo(1)] ?? 0);
  const before = (w[weeksAgo(2)] ?? 0) + (w[weeksAgo(3)] ?? 0);
  if (Date.now() - Date.parse(k.firstSeenAt) < 14 * DAY) return { trend: "new", recent };
  if (recent > before * 1.3 && recent >= 2) return { trend: "up", recent };
  if (recent < before * 0.7) return { trend: "down", recent };
  return { trend: "flat", recent };
}

export interface IngestEntry {
  keyword: string;
  origin: KeywordOrigin;
  views?: number | null;
  productId?: string | null;
  productHint?: string;
}

function view(k: TrendKeyword, productNames: Map<string, string>): TrendKeywordView {
  const { trend, recent } = trendOf(k);
  const daysLeft = k.pinned || k.status === "archived" ? null : Math.max(0, Math.ceil((Date.parse(k.lastSeenAt) + KEYWORD_LIFETIME_DAYS * DAY - Date.now()) / DAY));
  return { ...k, aliases: k.aliases ?? [], sources: k.sources ?? {}, weeks: k.weeks ?? {}, trend, recent, daysLeft, productName: k.productId ? (productNames.get(k.productId) ?? null) : null };
}

export const keywordLibrary = {
  /** 자동·수동 공통 저장. 같은 묶음이면 본 횟수·마지막 날·출처만 더한다 (보관함에 있으면 다시 살림, 숨김은 그대로) */
  async ingest(entries: IngestEntry[], userIdArg?: string): Promise<number> {
    const userId = userIdArg ?? (await getCurrentUserId());
    const byNorm = new Map<string, IngestEntry & { count: number; alts: string[] }>();
    for (const e of entries) {
      const keyword = e.keyword.replace(/^#/, "").replace(/\s+/g, " ").trim().slice(0, 40);
      if (e.origin !== "manual" && !isUsefulKeyword(keyword)) continue;
      const norm = normalizeKeyword(keyword);
      if (!norm) continue;
      const prev = byNorm.get(norm);
      if (prev) {
        prev.count++;
        prev.views = Math.max(prev.views ?? 0, e.views ?? 0);
        prev.productId ??= e.productId ?? null;
        if (keyword !== prev.keyword && !prev.alts.includes(keyword)) prev.alts.push(keyword);
      } else byNorm.set(norm, { ...e, keyword, count: 1, alts: [] });
      if (byNorm.size >= 60) break;
    }
    if (!byNorm.size) return 0;
    const repo = getRepositories().trendKeywords;
    const existing = new Map((await repo.findByNorms(userId, [...byNorm.keys()])).map((k) => [k.norm, k]));
    const now = nowIso();
    const week = isoWeek();
    for (const [norm, e] of byNorm) {
      const old = existing.get(norm);
      if (old) {
        const weeks = { ...(old.weeks ?? {}), [week]: ((old.weeks ?? {})[week] ?? 0) + e.count };
        const keys = Object.keys(weeks).sort().slice(-MAX_WEEKS);
        await repo.update(old.id, {
          aliases: [...new Set([...(old.aliases ?? []), ...[e.keyword, ...e.alts].filter((x) => x !== old.keyword)])].slice(-10),
          sources: { ...(old.sources ?? {}), [e.origin]: ((old.sources ?? {})[e.origin] ?? 0) + e.count },
          weeks: Object.fromEntries(keys.map((k) => [k, weeks[k]])),
          views: Math.max(old.views ?? 0, Math.floor(e.views ?? 0)),
          productId: old.productId ?? e.productId ?? null,
          productHint: old.productHint || e.productHint || "",
          lastSeenAt: now,
          ...(old.status === "archived" ? { status: "active" as const, archivedAt: null } : {}),
          updatedAt: now,
        });
      } else {
        await repo.insert({
          id: createId("kw"),
          userId,
          keyword: e.keyword,
          norm,
          aliases: e.alts.slice(0, 10),
          productId: e.productId ?? null,
          productHint: e.productHint ?? "",
          sources: { [e.origin]: e.count },
          weeks: { [week]: e.count },
          views: Math.floor(e.views ?? 0),
          interest: null,
          status: "active",
          pinned: false,
          hidden: false,
          note: "",
          firstSeenAt: now,
          lastSeenAt: now,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    return byNorm.size;
  },

  /** 자동 수집 (실패해도 조용히 — 원래 기능을 막지 않는다) */
  async ingestQuietly(entries: IngestEntry[], userId?: string): Promise<void> {
    try {
      const n = await this.ingest(entries, userId);
      if (n) console.info("[KeywordLibrary]", JSON.stringify({ origin: entries[0]?.origin, keywords: n }));
    } catch (e) {
      console.warn("[KeywordLibrary] skip", e instanceof Error ? e.message.slice(0, 120) : "");
    }
  },

  /** 목록 (열 때 만료 정리) */
  async list(): Promise<TrendKeywordView[]> {
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const rows = await repo.trendKeywords.list((k) => k.userId === userId);
    const limit = Date.now() - KEYWORD_LIFETIME_DAYS * DAY;
    const now = nowIso();
    for (const k of rows) {
      if (k.status === "active" && !k.pinned && Date.parse(k.lastSeenAt) < limit) {
        await repo.trendKeywords.update(k.id, { status: "archived", archivedAt: now, updatedAt: now });
        k.status = "archived";
        k.archivedAt = now;
      }
    }
    const products = await repo.products.list((p) => p.userId === userId);
    const names = new Map(products.map((p) => [p.id, p.name]));
    return rows.map((k) => view(k, names)).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },

  /** 원고 생성 화면 추천: 이 제품에 연결된 살아 있는 키워드 (상승·최근 본 순) */
  async suggest(productId: string): Promise<{ keyword: string; trend: KeywordTrend }[]> {
    const userId = await getCurrentUserId();
    const rows = await getRepositories().trendKeywords.list((k) => k.userId === userId && k.productId === productId && k.status === "active" && !k.hidden);
    const rank: Record<KeywordTrend, number> = { up: 0, new: 1, flat: 2, down: 3 };
    return rows
      .map((k) => ({ k, ...trendOf(k) }))
      .sort((a, b) => rank[a.trend] - rank[b.trend] || b.recent - a.recent || b.k.lastSeenAt.localeCompare(a.k.lastSeenAt))
      .slice(0, 15)
      .map(({ k, trend }) => ({ keyword: k.keyword, trend }));
  },

  async own(id: string): Promise<TrendKeyword> {
    const userId = await getCurrentUserId();
    const k = await getRepositories().trendKeywords.get(String(id));
    if (!k || k.userId !== userId) throw new AppError("NOT_FOUND", "키워드를 찾을 수 없습니다.", 404);
    return k;
  },

  /** 직접 추가 (6개월 수명은 같고, 필요하면 [고정]) */
  async add(input: { keyword?: unknown; productId?: unknown; productHint?: unknown; note?: unknown }): Promise<void> {
    const keyword = String(input.keyword ?? "").trim();
    if (!keyword) throw new AppError("VALIDATION", "키워드를 입력해 주세요.");
    const productId = typeof input.productId === "string" && input.productId ? input.productId : null;
    if (productId) {
      const p = await getRepositories().products.get(productId);
      if (!p || p.userId !== (await getCurrentUserId())) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
    }
    const parts = keyword.split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    await this.ingest(parts.map((k) => ({ keyword: k, origin: "manual" as const, productId, productHint: String(input.productHint ?? "").slice(0, 60) })));
    if (input.note) {
      const norms = parts.map(normalizeKeyword);
      const rows = await getRepositories().trendKeywords.findByNorms(await getCurrentUserId(), norms);
      for (const r of rows) if (!r.note) await getRepositories().trendKeywords.update(r.id, { note: String(input.note).slice(0, 200) });
    }
  },

  async update(id: string, patch: { productId?: unknown; productHint?: unknown; pinned?: unknown; hidden?: unknown; status?: unknown; note?: unknown; keyword?: unknown }): Promise<TrendKeyword> {
    const k = await this.own(id);
    const repo = getRepositories();
    const next: Partial<TrendKeyword> = { updatedAt: nowIso() };
    if (patch.productId !== undefined) {
      const pid = typeof patch.productId === "string" && patch.productId ? patch.productId : null;
      if (pid) {
        const p = await repo.products.get(pid);
        if (!p || p.userId !== k.userId) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
      }
      next.productId = pid;
    }
    if (patch.productHint !== undefined) next.productHint = String(patch.productHint ?? "").slice(0, 60);
    if (patch.pinned !== undefined) next.pinned = Boolean(patch.pinned);
    if (patch.hidden !== undefined) next.hidden = Boolean(patch.hidden);
    if (patch.note !== undefined) next.note = String(patch.note ?? "").slice(0, 200);
    if (patch.keyword !== undefined && String(patch.keyword).trim()) next.keyword = String(patch.keyword).trim().slice(0, 40);
    if (patch.status === "archived") Object.assign(next, { status: "archived", archivedAt: nowIso() });
    if (patch.status === "active") Object.assign(next, { status: "active", archivedAt: null, lastSeenAt: nowIso() });
    return (await repo.trendKeywords.update(k.id, next)) as TrendKeyword;
  },

  async remove(id: string): Promise<void> {
    const k = await this.own(id);
    await getRepositories().trendKeywords.remove(k.id);
  },

  /** [관심도 갱신]: 고른 키워드 최대 5개 → NAVER 데이터랩 1회 (상대 관심도, 검색량 아님) */
  async refreshInterest(ids: unknown): Promise<{ updated: number; calls: number }> {
    const list = (Array.isArray(ids) ? ids : []).map(String).slice(0, 5);
    if (!list.length) throw new AppError("VALIDATION", "관심도를 볼 키워드를 골라 주세요 (최대 5개).");
    const rows = await Promise.all(list.map((id) => this.own(id)));
    const nv = await getNaverTrendProvider();
    const rel = await nv.relativeInterest(rows.map((r) => r.keyword));
    const now = nowIso();
    let updated = 0;
    for (const r of rows) {
      const v = rel[r.keyword];
      if (!v) continue;
      const direction = v.recent > v.previous * 1.15 ? "up" : v.recent < v.previous * 0.85 ? "down" : "flat";
      await getRepositories().trendKeywords.update(r.id, { interest: { at: now, value: v.avg, direction }, updatedAt: now });
      updated++;
    }
    return { updated, calls: 1 };
  },
};
