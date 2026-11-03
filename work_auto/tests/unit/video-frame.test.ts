import { describe, expect, it } from "vitest";
import { cleanFrame, frameCrop } from "@/lib/video-production/config";

describe("컷 화면 직접 조정 (v0.9.156)", () => {
  it("배율·중심 → 자를 창 (가장자리 밖으로 안 나감)", () => {
    expect(frameCrop({ zoom: 1, x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    expect(frameCrop({ zoom: 2, x: 0.5, y: 0.5 })).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(frameCrop({ zoom: 2, x: 0, y: 1 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(frameCrop({ zoom: 9, x: 0.5, y: 0.5 }).w).toBeCloseTo(1 / 2.4, 3);
  });
  it("잘못된 값은 버리고 범위 안으로", () => {
    expect(cleanFrame(null)).toBeNull();
    expect(cleanFrame({ zoom: "x", x: 0, y: 0 })).toBeNull();
    expect(cleanFrame({ zoom: 0.5, x: -1, y: 2 })).toEqual({ zoom: 1, x: 0, y: 1 });
  });
});
