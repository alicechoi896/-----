import "server-only";
import { channelRatios } from "@/lib/domain/outlier";
import type { YouTubeChannelInsight } from "@/lib/types/youtube-channel";
import { AppError } from "../http";
import { getYouTubeTrendProvider } from "../providers/registry";

/**
 * 채널 정보 · 최근 6개월 뜬 영상 (v0.9.61). docs/OUTLIER_SCORE.md
 * - 채널 이름을 누를 때만 (자동 호출 없음). YouTube 할당량 약 3~9 units (무료 할당량 안, 돈은 들지 않음)
 * - 같은 채널은 30분 기억 (공개 정보라 사용자 사이에 같이 쓴다 → 할당량 절약)
 * - 기준: Shorts·롱폼 따로 조회수 중앙값, 영상마다 몇 배인지. 1.5·2·3배 거르기는 화면에서 (추가 호출 없음)
 */
const SINCE_DAYS = 180;
const TTL = 30 * 60 * 1000;
const cache = new Map<string, { at: number; value: YouTubeChannelInsight }>();
const inFlight = new Map<string, Promise<YouTubeChannelInsight>>();

export function clearChannelCache() {
  cache.clear();
}

export const youtubeChannelService = {
  async insight(input: { channelId?: unknown }): Promise<YouTubeChannelInsight> {
    const channelId = String(input.channelId ?? "").trim();
    if (!/^[\w-]{3,40}$/.test(channelId)) throw new AppError("VALIDATION", "채널 ID 가 올바르지 않습니다.");
    const hit = cache.get(channelId);
    if (hit && Date.now() - hit.at < TTL) return { ...hit.value, units: 0 };
    const running = inFlight.get(channelId);
    if (running) return { ...(await running), units: 0 };
    const p = (async () => {
      const provider = await getYouTubeTrendProvider();
      const t0 = Date.now();
      const r = await provider.getChannelInsight(channelId, SINCE_DAYS);
      const { videos, median } = channelRatios(r.videos);
      console.info("[YtChannel]", JSON.stringify({ channelId, videos: videos.length, units: r.units, truncated: r.truncated, ms: Date.now() - t0 }));
      return { channel: r.channel, sinceDays: SINCE_DAYS, videos, median, truncated: r.truncated, units: r.units } satisfies YouTubeChannelInsight;
    })()
      .then((v) => {
        cache.set(channelId, { at: Date.now(), value: v });
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
        return v;
      })
      .finally(() => inFlight.delete(channelId));
    inFlight.set(channelId, p);
    return p;
  },
};
