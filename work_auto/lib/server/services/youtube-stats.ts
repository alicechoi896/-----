import "server-only";
import { extractYouTubeId } from "../providers/trends/youtube-data-api-provider";
import { getYouTubeTrendProvider } from "../providers/registry";
import type { VideoStats } from "../providers/types";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import type { ContentPublication, PerformanceMetric } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

/**
 * YouTube 성과 자동 수집 (직원이 손으로 입력하지 않는다). docs/UPLOADS.md
 * - 업로드 관리에 YouTube 주소가 있는 "업로드 완료" 기록을 보고, 업로드 1일·7일 뒤 조회수·좋아요·댓글을 한 번씩 저장한다
 *   → 같은 시점끼리 비교할 수 있고, 학습 프로필의 "성과" 신호가 된다 (performance_metrics, source youtube-d1/d7)
 * - 서버 예약 작업이 아니라, 본인이 업로드 관리·학습 프로필 화면을 열 때(응답 뒤) 밀린 것을 채운다
 *   (각자 자기 YouTube 키·자기 콘텐츠만 쓸 수 있어서). 늦게 열면 그때 숫자로 저장하고 measuredAt 에 실제 시각을 남긴다
 * - 기준 시각 = 실제 업로드일, 없으면 예약일 (예약 시각이 지난 '예약' 건도 그때부터 센다, v0.9.28)
 * - 직원이 직접 넣은 조회수는 source "manual" 로 저장한다 (recordManual)
 * - 생성 시스템 밖의 직접 등록(콘텐츠 연결 없음)은 저장하지 않고 화면에 현재 숫자만 보여 준다
 * - YouTube API 비용: 영상 50개당 1 unit
 */
export const STATS_CHECKPOINTS = [
  { days: 1, source: "youtube-d1" },
  { days: 7, source: "youtube-d7" },
] as const;

export const isYouTubePublication = (p: Pick<ContentPublication, "platform" | "platformUrl">) =>
  Boolean(p.platformUrl && extractYouTubeId(p.platformUrl) && (p.platform === "youtube" || /youtu/.test(p.platformUrl)));

const liveCache = new Map<string, { at: number; value: VideoStats }>();
const LIVE_TTL_MS = 60 * 60 * 1000;

export const youtubeStatsService = {
  /** 밀린 1일·7일 성과를 저장한다. 저장한 콘텐츠 ID 를 돌려준다 (학습 신호) */
  async collectDue(): Promise<string[]> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const now = Date.now();
    const mine = await repo.publications.list(
      (p) =>
        p.userId === userId &&
        Boolean(p.contentId) &&
        isYouTubePublication(p) &&
        ((p.status === "published" && Boolean(p.publishedAt ?? p.scheduledAt)) ||
          (p.status === "scheduled" && Boolean(p.scheduledAt) && new Date(p.scheduledAt!).getTime() <= now)),
    );
    if (!mine.length) return [];
    const contentIds = new Set(mine.map((p) => p.contentId!));
    const existing = await repo.performance.list((m) => contentIds.has(m.contentId) && m.source.startsWith("youtube-d"));
    const done = new Set(existing.map((m) => `${m.contentId}:${m.source}`));
    const due: { pub: ContentPublication; source: (typeof STATS_CHECKPOINTS)[number]["source"]; videoId: string }[] = [];
    for (const pub of mine) {
      const age = now - new Date((pub.publishedAt ?? pub.scheduledAt)!).getTime();
      for (const cp of STATS_CHECKPOINTS) {
        if (age >= cp.days * 86_400_000 && !done.has(`${pub.contentId}:${cp.source}`)) {
          due.push({ pub, source: cp.source, videoId: extractYouTubeId(pub.platformUrl!)! });
          done.add(`${pub.contentId}:${cp.source}`);
        }
      }
    }
    if (!due.length) return [];
    const provider = await getYouTubeTrendProvider();
    const stats = await provider.getVideoStats(due.map((d) => d.videoId).slice(0, 50));
    const saved: string[] = [];
    for (const d of due) {
      const s = stats[d.videoId];
      if (!s) continue;
      const row: PerformanceMetric = {
        id: createId("pm"),
        contentId: d.pub.contentId!,
        channelId: "youtube",
        platformUrl: d.pub.platformUrl,
        views: s.views,
        clicks: null,
        ctr: null,
        likes: s.likes,
        comments: s.comments,
        conversions: null,
        revenue: null,
        source: d.source,
        measuredAt: nowIso(),
      };
      await repo.performance.insert(row);
      saved.push(d.pub.contentId!);
    }
    return [...new Set(saved)];
  },

  /**
   * 직원이 직접 넣은 조회수 (업로드 등록·수정 창). 생성 콘텐츠와 연결된 내 업로드만 — 성과 데이터로 저장되어 학습에 쓰인다
   */
  async recordManual(publicationId: string, input: { views?: unknown; likes?: unknown; comments?: unknown }): Promise<PerformanceMetric> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const pub = await repo.publications.get(publicationId);
    if (!pub) throw new AppError("NOT_FOUND", "업로드 기록을 찾을 수 없습니다.", 404);
    if (!pub.contentId) throw new AppError("VALIDATION", "생성한 콘텐츠와 연결된 업로드만 조회수를 학습에 쓸 수 있습니다. [기존 콘텐츠 선택]으로 등록해 주세요.");
    const content = await repo.contents.get(pub.contentId);
    if (!content || content.userId !== userId) throw new AppError("FORBIDDEN", "내가 만든 콘텐츠의 업로드만 조회수를 넣을 수 있습니다.", 403);
    const num = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/[,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1e11) throw new AppError("VALIDATION", "숫자를 확인해 주세요.");
      return Math.round(n);
    };
    const views = num(input.views);
    if (views == null) throw new AppError("VALIDATION", "조회수를 입력해 주세요.");
    const row: PerformanceMetric = {
      id: createId("pm"),
      contentId: pub.contentId,
      channelId: content.channelId,
      platformUrl: pub.platformUrl,
      views,
      clicks: null,
      ctr: null,
      likes: num(input.likes),
      comments: num(input.comments),
      conversions: null,
      revenue: null,
      source: "manual",
      measuredAt: nowIso(),
    };
    await repo.performance.insert(row);
    return row;
  },

  /** 화면용: YouTube 는 현재 숫자(1시간 기억) + 1일·7일 기록, 모든 업로드는 직접 넣은 조회수(최근 것) */
  async stats(
    publicationIds: string[],
  ): Promise<Record<string, Partial<VideoStats> & { d1?: number | null; d7?: number | null; manual?: { views: number; at: string } | null }>> {
    const repo = getRepositories();
    const want = new Set(publicationIds.slice(0, 50));
    const all = await repo.publications.list((p) => want.has(p.id));
    const allContentIds = new Set(all.map((p) => p.contentId).filter(Boolean) as string[]);
    const manualRows = allContentIds.size ? await repo.performance.list((m) => allContentIds.has(m.contentId) && m.source === "manual").catch(() => []) : [];
    const manualOf = (contentId: string | null) => {
      const latest = manualRows.filter((m) => m.contentId === contentId).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
      return latest && latest.views != null ? { views: latest.views, at: latest.measuredAt } : null;
    };
    const out: Record<string, Partial<VideoStats> & { d1?: number | null; d7?: number | null; manual?: { views: number; at: string } | null }> = {};
    for (const p of all) {
      const m = manualOf(p.contentId);
      if (m) out[p.id] = { manual: m };
    }
    const pubs = all.filter(isYouTubePublication);
    if (!pubs.length) return out;
    const ids = pubs.map((p) => extractYouTubeId(p.platformUrl!)!);
    const now = Date.now();
    const missing = ids.filter((id) => !(liveCache.get(id) && now - liveCache.get(id)!.at < LIVE_TTL_MS));
    if (missing.length) {
      const provider = await getYouTubeTrendProvider();
      const fresh = await provider.getVideoStats(missing).catch(() => ({}) as Record<string, VideoStats>);
      for (const [id, v] of Object.entries(fresh)) liveCache.set(id, { at: now, value: v });
      if (liveCache.size > 2000) liveCache.delete(liveCache.keys().next().value!);
    }
    const contentIds = new Set(pubs.map((p) => p.contentId).filter(Boolean) as string[]);
    const snaps = await repo.performance.list((m) => contentIds.has(m.contentId) && m.source.startsWith("youtube-d"));
    for (const p of pubs) {
      const live = liveCache.get(extractYouTubeId(p.platformUrl!)!)?.value;
      if (!live) continue;
      const mineSnaps = snaps.filter((m) => m.contentId === p.contentId);
      out[p.id] = {
        ...out[p.id],
        ...live,
        d1: mineSnaps.find((m) => m.source === "youtube-d1")?.views,
        d7: mineSnaps.find((m) => m.source === "youtube-d7")?.views,
      };
    }
    return out;
  },
};
