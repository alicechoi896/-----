import "server-only";
import { extractYouTubeId } from "../providers/trends/youtube-data-api-provider";
import { getYouTubeTrendProvider } from "../providers/registry";
import type { VideoStats } from "../providers/types";
import { getCurrentUserId, getRepositories } from "../repositories";
import type { ContentPublication, PerformanceMetric } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

/**
 * YouTube 성과 자동 수집 (직원이 손으로 입력하지 않는다). docs/UPLOADS.md
 * - 업로드 관리에 YouTube 주소가 있는 "업로드 완료" 기록을 보고, 업로드 1일·7일 뒤 조회수·좋아요·댓글을 한 번씩 저장한다
 *   → 같은 시점끼리 비교할 수 있고, 학습 프로필의 "성과" 신호가 된다 (performance_metrics, source youtube-d1/d7)
 * - 서버 예약 작업이 아니라, 본인이 업로드 관리·학습 프로필 화면을 열 때(응답 뒤) 밀린 것을 채운다
 *   (각자 자기 YouTube 키·자기 콘텐츠만 쓸 수 있어서). 늦게 열면 그때 숫자로 저장하고 measuredAt 에 실제 시각을 남긴다
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
      (p) => p.userId === userId && p.status === "published" && Boolean(p.contentId && p.publishedAt) && isYouTubePublication(p),
    );
    if (!mine.length) return [];
    const contentIds = new Set(mine.map((p) => p.contentId!));
    const existing = await repo.performance.list((m) => contentIds.has(m.contentId) && m.source.startsWith("youtube-d"));
    const done = new Set(existing.map((m) => `${m.contentId}:${m.source}`));
    const due: { pub: ContentPublication; source: (typeof STATS_CHECKPOINTS)[number]["source"]; videoId: string }[] = [];
    for (const pub of mine) {
      const age = now - new Date(pub.publishedAt!).getTime();
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

  /** 화면용 현재 숫자 (팀원 업로드 포함, 1시간 기억) + 내 콘텐츠면 1일·7일 기록 */
  async stats(publicationIds: string[]): Promise<Record<string, VideoStats & { d1?: number | null; d7?: number | null }>> {
    const repo = getRepositories();
    const want = new Set(publicationIds.slice(0, 50));
    const pubs = (await repo.publications.list((p) => want.has(p.id))).filter(isYouTubePublication);
    if (!pubs.length) return {};
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
    const out: Record<string, VideoStats & { d1?: number | null; d7?: number | null }> = {};
    for (const p of pubs) {
      const live = liveCache.get(extractYouTubeId(p.platformUrl!)!)?.value;
      if (!live) continue;
      const mineSnaps = snaps.filter((m) => m.contentId === p.contentId);
      out[p.id] = {
        ...live,
        d1: mineSnaps.find((m) => m.source === "youtube-d1")?.views,
        d7: mineSnaps.find((m) => m.source === "youtube-d7")?.views,
      };
    }
    return out;
  },
};
