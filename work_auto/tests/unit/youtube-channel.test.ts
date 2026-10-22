import { describe, expect, it } from "vitest";
const { channelRatios } = await import("@/lib/domain/outlier");

describe("채널 최근 6개월 뜬 영상 (v0.9.61)", () => {
  it("Shorts·롱폼을 따로 중앙값으로 비교한다", () => {
    const shorts = [100, 200, 300, 400, 500, 3000].map((views) => ({ views, format: "shorts" as const }));
    const long = [1000, 2000, 3000, 4000, 5000].map((views) => ({ views, format: "long" as const }));
    const r = channelRatios([...shorts, ...long]);
    expect(r.median).toEqual({ shorts: 350, long: 3000, shortsSample: 6, longSample: 5 });
    expect(r.videos.find((v) => v.views === 3000 && v.format === "shorts")?.ratio).toBe(8.6);
    expect(r.videos.find((v) => v.views === 3000 && v.format === "long")?.ratio).toBe(1);
  });
  it("표본이 5개보다 적은 형식은 배수 없음, 조회수 숨김도 없음", () => {
    const r = channelRatios([{ views: 100, format: "long" as const }, { views: null, format: "shorts" as const }]);
    expect(r.median.long).toBeNull();
    expect(r.videos.every((v) => v.ratio === null)).toBe(true);
  });
});
