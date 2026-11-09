import { describe, expect, it, vi } from "vitest";

/** v0.9.188 다른 기능 결과물 3일 뒤 삭제 — 결과물만, 3일 지난 것만 */
const old = new Date(Date.now() - 4 * 86400_000).toISOString();
const fresh = new Date(Date.now() - 1 * 86400_000).toISOString();
const files: Record<string, { name: string; at: string }[]> = {
  "u/fashion/f1/out": [{ name: "r1.mp4", at: old }, { name: "r2_feed.png", at: fresh }],
  "u/drama/d1/render": [{ name: "r1_x.mp4", at: old }],
  "u/multicam/m1": [{ name: "result_a.mp4", at: old }, { name: "src.mp4", at: old }, { name: "input_b.mp4", at: old }],
  "u/carousel/c1": [{ name: "slide_01_x.png", at: old }, { name: "pabc.jpg", at: old }],
  "u/detail/p1": [{ name: "s01_x.png", at: old }, { name: "full_x.jpg", at: old }, { name: "pabc.jpg", at: old }],
};
const removed: string[] = [];
vi.mock("@/lib/server/video/storage", () => ({
  videoStorage: {
    folders: async (dir: string) => ({ "u/fashion": ["f1"], "u/drama": ["d1"], "u/multicam": ["m1"], "u/carousel": ["c1"], "u/detail": ["p1"] })[dir] ?? [],
    list: async (dir: string) => (files[dir] ?? []).map((f) => ({ key: `${dir}/${f.name}`, createdAt: f.at, size: 10 })),
    remove: async (key: string) => void removed.push(key),
  },
}));
const { sweepOutputs } = await import("@/lib/server/video/output-sweep");

describe("결과물 3일 뒤 삭제 (v0.9.188)", () => {
  it("3일 지난 완성 결과물만 지우고, 원본·사진·새 결과물은 남긴다", async () => {
    const r = await sweepOutputs("u");
    expect(removed.sort()).toEqual(
      ["u/carousel/c1/slide_01_x.png", "u/detail/p1/full_x.jpg", "u/detail/p1/s01_x.png", "u/drama/d1/render/r1_x.mp4", "u/fashion/f1/out/r1.mp4", "u/multicam/m1/input_b.mp4", "u/multicam/m1/result_a.mp4"].sort(),
    );
    expect(r.removed).toBe(7);
  });
});
