import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mem = new Map<string, Buffer>();
vi.mock("@/lib/server/video/storage", () => ({
  videoStorage: {
    put: async (k: string, b: Buffer) => void mem.set(k, b),
    download: async (k: string) => mem.get(k) ?? null,
  },
}));

const { createCanvas } = await import("@napi-rs/canvas");
const { emptyFashionProject, lookPrompt, lookRefItems, modelPrompt } = await import("@/lib/fashion/prompts");
const { plainText, renderFeed, renderReels } = await import("@/lib/server/fashion/render");
const { mediaDuration } = await import("@/lib/server/video/ffmpeg");

function png(w: number, h: number, color: string): Buffer {
  const c = createCanvas(w, h);
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}

function project() {
  const p = emptyFashionProject("fp_test01", "가을 출근룩", "2026-11-01T00:00:00.000Z");
  p.settings.pov = "POV: 퇴근한 순간부터 연휴 즐기려고 꾸꾸꾸 상태로 출근한 나";
  for (const [i, color] of ["#8b5e3c", "#222222", "#d9d0c0"].entries()) {
    const key = `u/fashion/fp_test01/up/item${i}.png`;
    mem.set(key, png(500, 600, color));
    p.items.push({ id: `it_${i}`, name: ["브라운 자켓", "블랙 롱스커트", "로퍼"][i], category: (["outer", "bottom", "shoes"] as const)[i], imageKey: key, sourceUrl: "https://www.coupang.com/vp/products/1", createdAt: "" });
  }
  const mk = `u/fashion/fp_test01/img/model.png`;
  mem.set(mk, png(720, 1280, "#aaaaaa"));
  p.model.images.push({ id: "im_m", key: mk, prompt: "", modelId: "upload", source: "upload", createdAt: "", approved: true });
  for (const i of [0, 1]) {
    const key = `u/fashion/fp_test01/img/look${i}.png`;
    mem.set(key, png(720, 1280, i ? "#556677" : "#776655"));
    p.looks.push({ id: `lk_${i}`, name: `LOOK ${i + 1}`, itemIds: i ? ["it_1", "it_2"] : ["it_0", "it_1", "it_2"], caption: i ? "하객룩은 차분하게" : "출근은 단정하게", pose: "", images: [{ id: `im_${i}`, key, prompt: "", modelId: "upload", source: "upload", createdAt: "", approved: true }] });
  }
  return p;
}

describe("AI 패션 프롬프트 (v0.9.103)", () => {
  it("룩: 모델은 reference image 1, 상품은 2부터 그대로 입히고 배경·카메라 고정", () => {
    const p = project();
    const t = lookPrompt(p, p.looks[0], lookRefItems(p, p.looks[0]), true);
    expect(t).toContain("The woman in reference image 1");
    expect(t).toContain("브라운 자켓 (exactly the item in reference image 2)");
    expect(t).toContain("로퍼 (exactly the item in reference image 4)");
    expect(t).toContain("Exactly the same background, camera position");
  });
  it("실제 사진 모델은 '다른 얼굴'로", () => {
    expect(modelPrompt({ mode: "photo", description: "", photoKey: "x", images: [] })).toContain("clearly different person");
    expect(modelPrompt({ mode: "ai", description: "", photoKey: null, images: [] })).not.toContain("[REFERENCE]");
  });
});

describe("AI 패션 결과물 (Canvas·FFmpeg)", () => {
  it("글꼴에 없는 이모지는 빼고 그린다", () => {
    expect(plainText("DM 으로 보내 드려요 💌")).toBe("DM 으로 보내 드려요");
    expect(plainText("하객룩 👰🏻‍♀️ 차분하게 ✨")).toBe("하객룩 차분하게");
  });
  it("피드: 표지 + 룩마다 1080×1350 카드", async () => {
    const p = project();
    const keys = await renderFeed("u", p, { id: "fr_feed", kind: "feed", status: "running", keys: [], totalSec: null, error: null, createdAt: "", updatedAt: "" });
    expect(keys).toHaveLength(3);
    if (process.env.FASHION_DUMP) for (const [i, k] of keys.entries()) (await import("node:fs")).writeFileSync(`${process.env.FASHION_DUMP}/feed${i}.png`, mem.get(k)!);
    const { loadImage } = await import("@napi-rs/canvas");
    const img = await loadImage(mem.get(keys[1])!);
    expect([img.width, img.height]).toEqual([1080, 1350]);
  });
  it("릴스 (가): 룩 2개 × 2초 + 안내 2.5초 = 6.5초 mp4", async () => {
    const p = project();
    const out = await renderReels("u", p, { id: "fr_reel", kind: "reels", status: "running", keys: [], totalSec: null, error: null, createdAt: "", updatedAt: "" });
    expect(out.totalSec).toBe(6.5);
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const f = path.join(os.tmpdir(), "fashion_test.mp4");
    await fs.writeFile(f, mem.get(out.key)!);
    if (process.env.FASHION_DUMP) await fs.writeFile(`${process.env.FASHION_DUMP}/reel.mp4`, mem.get(out.key)!);
    expect(Math.abs((await mediaDuration(f)) - 6.5)).toBeLessThan(0.4);
  }, 120_000);
});
