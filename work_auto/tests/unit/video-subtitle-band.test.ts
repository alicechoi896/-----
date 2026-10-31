import { test, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
test("자막 띠: 아래쪽 자막이 한 번이라도 나오면 영상 내내 그 높이를 피한다", async () => {
  const { persistentBoxes, decideTreatment, boxesIn } = await import("@/lib/server/video/text-scan");
  const scan = { checked: true, interval: 1, samples: [
    { t: 0.2, boxes: [{ x: 0.1, y: 0.72, w: 0.8, h: 0.08 }] },
    { t: 1.2, boxes: [] },
    { t: 2.2, boxes: [{ x: 0.05, y: 0.78, w: 0.9, h: 0.12 }] },
    { t: 3.2, boxes: [] },
    { t: 4.2, boxes: [] },
  ] };
  const band = persistentBoxes(scan);
  expect(band[0].w).toBe(1);
  const tr = decideTreatment([...boxesIn(scan, 3.5, 0.7), ...band], true, 9 / 16);
  expect(["crop", "blur"]).toContain(tr.kind);
});
