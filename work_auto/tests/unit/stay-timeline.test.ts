import { describe, expect, it } from "vitest";
import { STAY_AUTO_CUT_SEC, stayCaptionsFor, stayTimeline } from "@/lib/server/video/stay-timeline";

describe("stayTimeline (v0.9.171 AI 숙소: 영상과 대사 따로)", () => {
  it("짧은 대사여도 컷은 자동 길이로 이어지고, 대사는 컷과 상관없이 차례로", () => {
    const tl = stayTimeline([0.8, 0.9, 1.0], [null, null, null], 5);
    expect(tl.cuts).toEqual([STAY_AUTO_CUT_SEC, STAY_AUTO_CUT_SEC, STAY_AUTO_CUT_SEC]);
    expect(tl.lines[1].from).toBeCloseTo(0.2 + 0.8 + 0.25, 3);
    expect(tl.total).toBeCloseTo(7.5, 3);
    expect(tl.overflow).toBe(false);
  });
  it("정한 컷 시간은 그대로, 대사가 길면 자동 컷부터 늘린다 (최대 5초)", () => {
    const tl = stayTimeline([3, 3, 3], [2, null, null], 5);
    expect(tl.cuts[0]).toBe(2);
    expect(tl.cuts[1] + tl.cuts[2]).toBeGreaterThan(5);
    expect(tl.total).toBeGreaterThanOrEqual(0.2 + 9 + 0.5 + 0.8 - 0.01);
  });
  it("컷을 넘는 대사는 다음 컷 자막으로 이어진다", () => {
    const tl = stayTimeline([3.5, 0.5], [2, 3], 5);
    const c0 = stayCaptionsFor(tl, 0);
    const c1 = stayCaptionsFor(tl, 1);
    expect(c0.map((x) => x.line)).toEqual([0]);
    expect(c1[0].line).toBe(0);
    expect(c1.some((x) => x.line === 1)).toBe(true);
  });
});
