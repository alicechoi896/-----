import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOutlierHit, median, outlierScore } from "@/lib/domain/outlier";

/** 아웃라이어 점수 = 조회수 ÷ 채널 최근 15개 중앙값 (v0.9.34) */
const yt = { getChannelRecentVideoIds: vi.fn(), getVideoStats: vi.fn() };
vi.mock("@/lib/server/providers/registry", () => ({ getYouTubeTrendProvider: async () => yt }));
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u1" }));
const { youtubeOutlierService, clearOutlierCache } = await import("@/lib/server/services/youtube-outlier");

beforeEach(() => {
  vi.clearAllMocks();
  clearOutlierCache();
  yt.getChannelRecentVideoIds.mockImplementation(async (c: string) => Array.from({ length: 15 }, (_, i) => `${c}-${i}`));
  // 채널 A 는 평소 1만, B 는 평소 100만
  yt.getVideoStats.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { views: id.startsWith("UCA") ? 10_000 : 1_000_000, likes: null, comments: null }])));
});

describe("계산", () => {
  it("중앙값·점수·터진 영상(3배 이상)", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    const s = outlierScore(80_000, Array(15).fill(10_000))!;
    expect(s).toEqual({ score: 8, median: 10_000, sample: 15 });
    expect(isOutlierHit(s)).toBe(true);
    expect(isOutlierHit(outlierScore(20_000, Array(15).fill(10_000)))).toBe(false);
  });
  it("표본이 적거나 중앙값이 0이면 점수 없음", () => {
    expect(outlierScore(100, [1, 2, 3])).toBeNull();
    expect(outlierScore(100, Array(10).fill(0))).toBeNull();
  });
});

describe("YouTube 할당량", () => {
  const A = "UCA" + "a".repeat(21);
  const B = "UCB" + "b".repeat(21);
  it("구독자 많은 채널의 100만 회는 평범, 작은 채널의 8만 회는 터짐 / 채널당 1 unit + 50개당 1 unit", async () => {
    const r = await youtubeOutlierService.scores({
      items: [
        { videoId: "v1", channelId: A, views: 80_000 },
        { videoId: "v2", channelId: A, views: 9_000 },
        { videoId: "v3", channelId: B, views: 1_000_000 },
      ],
    });
    expect(r.scores.v1!.score).toBe(8);
    expect(isOutlierHit(r.scores.v1)).toBe(true);
    expect(r.scores.v3!.score).toBe(1);
    expect(yt.getChannelRecentVideoIds).toHaveBeenCalledTimes(2); // 같은 채널은 한 번
    expect(yt.getVideoStats).toHaveBeenCalledTimes(1); // 30개 → 1번
    expect(r.unitsUsed).toBe(3);
  });
  it("같은 채널은 6시간 기억 → 다시 계산해도 0 unit", async () => {
    await youtubeOutlierService.scores({ items: [{ videoId: "v1", channelId: A, views: 1 }] });
    const r = await youtubeOutlierService.scores({ items: [{ videoId: "v9", channelId: A, views: 30_000 }] });
    expect(r.unitsUsed).toBe(0);
    expect(r.cachedChannels).toBe(1);
    expect(r.scores.v9!.score).toBe(3);
  });
});
