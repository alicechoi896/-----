import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parsePostMedia } = await import("@/lib/server/providers/instagram/parse");

describe("parsePostMedia (v0.9.178 릴스 영상 · 캐러셀 사진)", () => {
  it("캐러셀: 장마다 가장 큰 사진, 영상 장은 영상", () => {
    const body = { data: { items: [{ code: "ABC123", caption: { text: "가을 코디 5가지" }, user: { username: "shop" }, carousel_media: [
      { image_versions2: { candidates: [{ url: "https://x/s.jpg", width: 320 }, { url: "https://x/l.jpg", width: 1080 }] } },
      { video_versions: [{ url: "https://x/v.mp4" }], image_versions2: { candidates: [{ url: "https://x/t.jpg", width: 640 }] } },
    ] }] } };
    const m = parsePostMedia(body, "ABC123")!;
    expect(m.caption).toBe("가을 코디 5가지");
    expect(m.author).toBe("shop");
    expect(m.items).toEqual([{ type: "image", url: "https://x/l.jpg" }, { type: "video", url: "https://x/v.mp4" }]);
  });
  it("릴스 1개: 영상", () => {
    const m = parsePostMedia({ data: { code: "R1", video_versions: [{ url: "https://x/r.mp4" }] } }, "R1")!;
    expect(m.items).toEqual([{ type: "video", url: "https://x/r.mp4" }]);
  });
});
