import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/providers/registry", () => ({ getVisionProvider: async () => ({ id: "mock", supportsVision: false }) }));
const { decideTreatment, TITLE_BAR_FRAC } = await import("@/lib/server/video/text-scan");

/** v0.9.190 제품 정가운데: 화면 폭을 꽉 채우는 큰 제품이 위쪽에 있어도 가운데로 */
describe("제품 가운데 맞추기", () => {
  it("위쪽에 있는 넓은 제품(폰)을 가운데로 — 1.45배 안", () => {
    const product = { x: 0, y: 0.2, w: 1, h: 0.36 };
    const tr = decideTreatment([], true, 9 / 16, TITLE_BAR_FRAC, product);
    expect(tr.kind).toBe("clean");
    expect(tr.crop).toBeTruthy();
    const c = tr.crop!;
    expect(1 / c.w).toBeLessThanOrEqual(1.45 + 1e-6);
    // 보이는 곳(제목 띠 아래) 가운데가 원래(0.6 쯤)보다 제품 가운데(0.38)에 가까워진다
    const visCenter = c.y + c.h * TITLE_BAR_FRAC + (c.h * (1 - TITLE_BAR_FRAC)) / 2;
    expect(Math.abs(visCenter - 0.38)).toBeLessThan(Math.abs(TITLE_BAR_FRAC + (1 - TITLE_BAR_FRAC) / 2 - 0.38));
  });
  it("이미 가운데 있는 제품은 그대로", () => {
    const mid = TITLE_BAR_FRAC + (1 - TITLE_BAR_FRAC) / 2;
    const tr = decideTreatment([], true, 9 / 16, TITLE_BAR_FRAC, { x: 0.3, y: mid - 0.1, w: 0.4, h: 0.2 });
    expect(tr.crop).toBeFalsy();
  });
});
