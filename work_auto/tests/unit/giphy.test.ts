import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { parseGiphy, isGiphyUrl } = await import("@/lib/server/providers/giphy");

describe("GIPHY (v0.9.102)", () => {
  it("검색 결과 → 렌더용 GIF·미리 보기 주소", () => {
    const list = parseGiphy({
      data: [
        { id: "a1", title: "wow sticker", images: { downsized: { url: "https://media4.giphy.com/media/x/giphy.gif", width: "200", height: "200" }, fixed_height_small: { url: "https://media4.giphy.com/media/x/100.gif" } } },
        { id: "bad", title: "evil", images: { downsized: { url: "https://evil.example/x.gif" } } },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "a1", url: "https://media4.giphy.com/media/x/giphy.gif", preview: "https://media4.giphy.com/media/x/100.gif", width: 200 });
  });
  it("GIPHY 파일 서버(https)만 허용", () => {
    expect(isGiphyUrl("https://media.giphy.com/a.gif")).toBe(true);
    expect(isGiphyUrl("http://media.giphy.com/a.gif")).toBe(false);
    expect(isGiphyUrl("https://giphy.com.evil.example/a.gif")).toBe(false);
    expect(isGiphyUrl("nope")).toBe(false);
  });
});
