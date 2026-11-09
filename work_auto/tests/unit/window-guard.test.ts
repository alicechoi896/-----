import { describe, expect, it } from "vitest";
import { guardWindow, guardWindows, toOutput } from "@/lib/server/video/window-guard";

describe("window-guard (v0.9.185 사람이 정한 화면에도 원본 글자 가리기)", () => {
  it("9:16 원본은 좌표 그대로, 3:4 원본은 양옆이 잘린 만큼 넓어진다", () => {
    const same = toOutput({ x: 0.1, y: 0.8, w: 0.8, h: 0.1 }, 9 / 16)!;
    expect(same.x).toBeCloseTo(0.1, 6);
    expect(same.h).toBeCloseTo(0.1, 6);
    const o = toOutput({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }, 3 / 4)!;
    expect(o.w).toBeCloseTo(0.1 / (9 / 16 / (3 / 4)), 3);
  });
  it("글자가 안 보이는 창은 그대로", () => {
    const win = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(guardWindow(win, [{ x: 0, y: 0.9, w: 1, h: 0.08 }], 0, null)).toBe(win);
  });
  it("아래 자막이 보이면 더 확대해 자막 위쪽 창으로 (제품 쪽으로)", () => {
    const g = guardWindow({ x: 0, y: 0, w: 1, h: 1 }, [{ x: 0, y: 0.85, w: 1, h: 0.1 }], 0, { x: 0.5, y: 0.45 })!;
    expect(g.w).toBeLessThan(1);
    expect(g.y + g.h).toBeLessThanOrEqual(0.85 + 1e-6);
  });
  it("창이 없어도(기본 화면) 자막이 보이면 확대 창을 만든다", () => {
    const r = guardWindows({ base: null, segs: [] }, [{ x: 0.05, y: 0.86, w: 0.9, h: 0.06 }], 9 / 16, 0.1, { x: 0.3, y: 0.3, w: 0.4, h: 0.3 });
    expect(r.ok).toBe(true);
    expect(r.base).not.toBeNull();
    expect(r.changed).toBe(true);
  });
});
