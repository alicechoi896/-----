import "server-only";
import type { SavedFilter, SavedTrend, YouTubeTrendItem, YouTubeVideoAnalysis } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { normalizeYouTubeQuery } from "./trends";

const MAX_FILTERS = 30;
const MAX_SAVED_TRENDS = 300;

const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

/** 저장한 검색 조건 + 찜한 트렌드 영상 (DB 저장, 사용자별) */
export const savedTrendService = {
  /* ───────── 검색 조건 ───────── */

  async listFilters(): Promise<SavedFilter[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().savedFilters.list((f) => f.userId === userId)).sort(byNewest);
  },

  async getDefaultFilter(): Promise<SavedFilter | null> {
    return (await this.listFilters()).find((f) => f.isDefault) ?? null;
  },

  async saveFilter(input: { name?: string; params?: Record<string, unknown>; isDefault?: boolean }): Promise<SavedFilter> {
    const name = input.name?.trim().slice(0, 40);
    if (!name) throw new AppError("VALIDATION", "조건 이름을 입력해 주세요.");
    const params = normalizeYouTubeQuery(input.params ?? {});
    delete params.pageToken;
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const existing = await this.listFilters();
    const same = existing.find((f) => f.name === name);
    if (!same && existing.length >= MAX_FILTERS) throw new AppError("LIMIT", `검색 조건은 ${MAX_FILTERS}개까지 저장할 수 있습니다.`);
    if (input.isDefault) await this.clearDefault(existing);
    const now = nowIso();
    if (same) {
      return (await repo.savedFilters.update(same.id, { params, isDefault: Boolean(input.isDefault) || same.isDefault, updatedAt: now }))!;
    }
    return repo.savedFilters.insert({
      id: createId("flt"),
      userId,
      kind: "youtube-trend",
      name,
      params,
      isDefault: Boolean(input.isDefault),
      createdAt: now,
      updatedAt: now,
    });
  },

  async updateFilter(id: string, patch: { name?: string; isDefault?: boolean }): Promise<SavedFilter> {
    const filters = await this.listFilters();
    const target = filters.find((f) => f.id === id);
    if (!target) throw new AppError("NOT_FOUND", "저장된 조건을 찾을 수 없습니다.", 404);
    if (patch.isDefault) await this.clearDefault(filters.filter((f) => f.id !== id));
    const name = patch.name?.trim().slice(0, 40);
    return (await getRepositories().savedFilters.update(id, {
      ...(name ? { name } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      updatedAt: nowIso(),
    }))!;
  },

  async removeFilter(id: string) {
    await getRepositories().savedFilters.remove(id);
  },

  async clearDefault(filters: SavedFilter[]) {
    const repo = getRepositories();
    await Promise.all(filters.filter((f) => f.isDefault).map((f) => repo.savedFilters.update(f.id, { isDefault: false })));
  },

  /* ───────── 찜한 영상 ───────── */

  async list(): Promise<SavedTrend[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().savedTrends.list((t) => t.userId === userId)).sort(byNewest);
  },

  async add(item: Partial<YouTubeTrendItem>): Promise<SavedTrend> {
    if (!item.videoId || !/^[\w-]{3,20}$/.test(item.videoId) || !item.title) {
      throw new AppError("VALIDATION", "찜할 영상 정보가 올바르지 않습니다.");
    }
    const trendId = `yt_${item.videoId}`;
    const existing = await this.list();
    const dup = existing.find((t) => t.trendId === trendId);
    if (dup) return dup;
    if (existing.length >= MAX_SAVED_TRENDS) throw new AppError("LIMIT", `찜은 ${MAX_SAVED_TRENDS}개까지 할 수 있습니다. 오래된 찜을 정리해 주세요.`);
    const strings = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).slice(0, n) : []);
    return getRepositories().savedTrends.insert({
      id: createId("bm"),
      userId: await getCurrentUserId(),
      source: "youtube",
      trendId,
      videoId: item.videoId,
      title: String(item.title).slice(0, 200),
      format: item.format === "shorts" ? "shorts" : "long",
      url: `https://www.youtube.com/watch?v=${item.videoId}`,
      channelName: String(item.channelName ?? "").slice(0, 100),
      thumbnailUrl: typeof item.thumbnailUrl === "string" && item.thumbnailUrl.startsWith("https://") ? item.thumbnailUrl : null,
      keywords: strings(item.keywords, 5),
      tags: strings(item.tags, 30),
      views: Math.max(0, Math.floor(Number(item.views) || 0)),
      publishedAt: item.publishedAt ?? nowIso(),
      analysis: null,
      createdAt: nowIso(),
    });
  },

  async remove(id: string) {
    await getRepositories().savedTrends.remove(id);
  },

  /** 찜한 영상이면 AI 분석 결과를 함께 저장한다 (다음에 다시 분석하지 않도록) */
  async attachAnalysis(videoId: string, analysis: YouTubeVideoAnalysis) {
    const saved = (await this.list()).find((t) => t.videoId === videoId);
    if (saved) await getRepositories().savedTrends.update(saved.id, { analysis });
  },
};
