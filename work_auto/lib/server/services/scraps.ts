import "server-only";
import type { SavedTrend, ScrapSource } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";

/**
 * 트렌드 스크랩 (v0.9.54) — YouTube·NAVER·Instagram 트렌드를 저장해 두고 분류(폴더 이름)로 모아 본다. docs/SCRAPS.md
 * saved_trends 테이블을 그대로 쓴다 (YouTube 찜 = 분류 없음 스크랩). 외부 API 호출 없음 — 화면에 있던 정보만 저장.
 */
const MAX_SCRAPS = 1000;
const MAX_FOLDER = 30;
const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const strings = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => str(x, 60)).filter(Boolean).slice(0, n) : []);
const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v.slice(0, 1000) : null);
const numOr0 = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

export interface ScrapInput {
  source?: unknown;
  /** 출처별 항목 ID (YouTube videoId · NAVER 주제 ID · Instagram code) */
  itemId?: unknown;
  title?: unknown;
  url?: unknown;
  channelName?: unknown;
  thumbnailUrl?: unknown;
  keywords?: unknown;
  tags?: unknown;
  views?: unknown;
  publishedAt?: unknown;
  format?: unknown;
  folder?: unknown;
  meta?: unknown;
}

function sourceOf(v: unknown): ScrapSource {
  if (v === "naver" || v === "instagram") return v;
  if (v === "youtube") return "youtube";
  throw new AppError("VALIDATION", "스크랩할 트렌드 종류가 올바르지 않습니다.");
}

/** 출처별 주소 검사 (스크랩은 그 플랫폼 주소만 저장) */
function urlFor(source: ScrapSource, itemId: string, url: unknown): string {
  if (source === "youtube") return `https://www.youtube.com/watch?v=${itemId}`;
  if (source === "instagram") return `https://www.instagram.com/reel/${itemId}/`;
  const u = httpsOrNull(url);
  return u && /^https:\/\/([\w-]+\.)*naver\.com\//.test(u) ? u : `https://search.naver.com/search.naver?query=${encodeURIComponent(itemId)}`;
}

export const scrapService = {
  async list(): Promise<SavedTrend[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().savedTrends.list((t) => t.userId === userId)).map((t) => ({ ...t, folder: t.folder ?? "", meta: t.meta ?? {} })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async folders(): Promise<{ name: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const t of await this.list()) if (t.folder) counts.set(t.folder, (counts.get(t.folder) ?? 0) + 1);
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  },

  /** 스크랩 (같은 항목이면 분류만 바꾼다) */
  async add(input: ScrapInput): Promise<SavedTrend> {
    const source = sourceOf(input.source);
    const itemId = str(input.itemId, 120);
    const title = str(input.title, 300);
    if (!itemId || !title) throw new AppError("VALIDATION", "스크랩할 트렌드 정보가 올바르지 않습니다.");
    if (source === "youtube" && !/^[\w-]{3,20}$/.test(itemId)) throw new AppError("VALIDATION", "YouTube 영상 ID 가 올바르지 않습니다.");
    if (source === "instagram" && !/^[\w-]{5,40}$/.test(itemId)) throw new AppError("VALIDATION", "인스타그램 릴스 코드가 올바르지 않습니다.");
    const folder = str(input.folder, MAX_FOLDER);
    const trendId = source === "youtube" ? `yt_${itemId}` : source === "instagram" ? `ig_${itemId}` : `nv_${itemId}`;
    const repo = getRepositories();
    const existing = await this.list();
    const dup = existing.find((t) => t.trendId === trendId);
    if (dup) return dup.folder === folder ? dup : ((await repo.savedTrends.update(dup.id, { folder })) as SavedTrend);
    if (existing.length >= MAX_SCRAPS) throw new AppError("LIMIT", `스크랩은 ${MAX_SCRAPS}개까지 할 수 있습니다. 오래된 스크랩을 정리해 주세요.`);
    const meta = input.meta && typeof input.meta === "object" && !Array.isArray(input.meta) ? JSON.parse(JSON.stringify(input.meta).slice(0, 4000) || "{}") : {};
    const publishedAt = typeof input.publishedAt === "string" && !Number.isNaN(Date.parse(input.publishedAt)) ? new Date(input.publishedAt).toISOString() : null;
    return repo.savedTrends.insert({
      id: createId("bm"),
      userId: await getCurrentUserId(),
      source,
      trendId,
      videoId: source === "naver" ? "-" : itemId,
      title,
      format: input.format === "shorts" || source === "instagram" ? "shorts" : "long",
      url: urlFor(source, itemId, input.url),
      channelName: str(input.channelName, 100),
      thumbnailUrl: httpsOrNull(input.thumbnailUrl),
      keywords: strings(input.keywords, 10),
      tags: strings(input.tags, 30),
      views: numOr0(input.views),
      publishedAt,
      analysis: null,
      folder,
      meta,
      createdAt: nowIso(),
    });
  },

  async own(id: string): Promise<SavedTrend> {
    const userId = await getCurrentUserId();
    const t = await getRepositories().savedTrends.get(String(id));
    if (!t || t.userId !== userId) throw new AppError("NOT_FOUND", "스크랩을 찾을 수 없습니다.", 404);
    return t;
  },

  async move(id: string, folder: unknown): Promise<SavedTrend> {
    const t = await this.own(id);
    return (await getRepositories().savedTrends.update(t.id, { folder: str(folder, MAX_FOLDER) })) as SavedTrend;
  },

  /** 분류 이름 바꾸기 (그 분류의 스크랩 모두) */
  async renameFolder(from: unknown, to: unknown): Promise<{ moved: number }> {
    const a = str(from, MAX_FOLDER);
    const b = str(to, MAX_FOLDER);
    if (!a) throw new AppError("VALIDATION", "바꿀 분류를 골라 주세요.");
    const repo = getRepositories();
    const rows = (await this.list()).filter((t) => t.folder === a);
    for (const t of rows) await repo.savedTrends.update(t.id, { folder: b });
    return { moved: rows.length };
  },

  async remove(id: string): Promise<void> {
    const t = await this.own(id);
    await getRepositories().savedTrends.remove(t.id);
  },
};
