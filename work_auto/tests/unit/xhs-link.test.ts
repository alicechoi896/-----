import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isShortXhsLink, usableXhsVideo } = await import("@/lib/server/video/vault");

describe("샤오홍슈 공유 링크 (v0.9.113)", () => {
  it("xhslink.com 공유 링크는 영구 링크", () => {
    expect(isShortXhsLink("http://xhslink.com/o/17ncAfJ4Bdb")).toBe(true);
    expect(isShortXhsLink("https://www.xhslink.com/a/x")).toBe(true);
    expect(isShortXhsLink("https://www.xiaohongshu.com/explore/6873c7f300000000100252be?xsec_token=abc")).toBe(false);
    expect(isShortXhsLink("https://xhslink.com.evil.example/x")).toBe(false);
  });
  it("자동 제작에 쓸 수 있는 영상: 공유 링크 또는 7일 임시 캐시에 원본", () => {
    const stored = new Set(["v2"]);
    expect(usableXhsVideo({ id: "v1", url: "http://xhslink.com/o/a", platform: "xiaohongshu" }, stored)).toBe(true);
    expect(usableXhsVideo({ id: "v2", url: "https://www.xiaohongshu.com/explore/x", platform: "xiaohongshu" }, stored)).toBe(true);
    expect(usableXhsVideo({ id: "v3", url: "https://www.xiaohongshu.com/explore/x", platform: "xiaohongshu" }, stored)).toBe(false);
  });
});
