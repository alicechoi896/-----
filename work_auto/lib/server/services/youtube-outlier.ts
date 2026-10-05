import "server-only";
import { OUTLIER_CONFIG, outlierScore, type OutlierScore } from "@/lib/domain/outlier";
import { AppError } from "../http";
import { getYouTubeTrendProvider } from "../providers/registry";
import { getCurrentUserId } from "../repositories";

/**
 * 아웃라이어 점수 (YouTube 트렌드 찾기 › [아웃라이어 점수 계산]). docs/OUTLIER_SCORE.md
 * - 누를 때만 계산한다 (YouTube 할당량: 채널당 1 unit + 영상 50개당 1 unit)
 * - 채널 최근 영상 조회수는 서버 메모리에 6시간 기억 → 같은 채널은 다시 부르지 않는다. DB 저장 없음
 */
const CHANNEL_TTL_MS = 6 * 60 * 60 * 1000;
const channelCache = new Map<string, { at: number; views: number[] }>();
const MAX_ITEMS = 100;

export function clearOutlierCache(): void {
  channelCache.clear();
}

export const youtubeOutlierService = {
  async scores(input: { items?: unknown }): Promise<{ scores: Record<string, OutlierScore | null>; unitsUsed: number; channels: number; cachedChannels: number }> {
    const raw = Array.isArray(input.items) ? input.items.slice(0, MAX_ITEMS) : [];
    const items = raw
      .map((r) => ({
        videoId: String((r as { videoId?: unknown })?.videoId ?? ""),
        channelId: String((r as { channelId?: unknown })?.channelId ?? ""),
        views: Number((r as { views?: unknown })?.views),
      }))
      .filter((r) => r.videoId && r.channelId && Number.isFinite(r.views) && r.views >= 0);
    if (!items.length) throw new AppError("VALIDATION", "점수를 계산할 영상이 없습니다.");
    await getCurrentUserId(); // 로그인 확인 (데모 포함)
    const yt = await getYouTubeTrendProvider();

    const channels = [...new Set(items.map((i) => i.channelId))];
    const fresh = (c: string) => {
      const hit = channelCache.get(c);
      return hit && Date.now() - hit.at < CHANNEL_TTL_MS ? hit : null;
    };
    const need = channels.filter((c) => !fresh(c));
    let unitsUsed = 0;

    // ① 채널별 최근 영상 ID (채널당 1 unit, 동시에 5개씩)
    const recent = new Map<string, string[]>();
    for (let i = 0; i < need.length; i += 5) {
      const batch = need.slice(i, i + 5);
      const got = await Promise.all(batch.map((c) => yt.getChannelRecentVideoIds(c, OUTLIER_CONFIG.recentCount)));
      unitsUsed += batch.length;
      batch.forEach((c, k) => recent.set(c, got[k]));
    }
    // ② 조회수 (50개씩 1 unit)
    const allIds = [...new Set([...recent.values()].flat())];
    const views = new Map<string, number>();
    for (let i = 0; i < allIds.length; i += 50) {
      const stats = await yt.getVideoStats(allIds.slice(i, i + 50));
      unitsUsed += 1;
      for (const [id, s] of Object.entries(stats)) if (s.views != null) views.set(id, s.views);
    }
    for (const [c, ids] of recent) {
      channelCache.set(c, { at: Date.now(), views: ids.map((id) => views.get(id)).filter((v): v is number => v != null) });
      if (channelCache.size > 2000) channelCache.delete(channelCache.keys().next().value!);
    }

    const scores: Record<string, OutlierScore | null> = {};
    for (const it of items) scores[it.videoId] = outlierScore(it.views, channelCache.get(it.channelId)?.views ?? []);
    return { scores, unitsUsed, channels: channels.length, cachedChannels: channels.length - need.length };
  },
};
