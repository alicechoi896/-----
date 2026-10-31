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

describe("TikHub 응답에서 영구 링크 찾기 (v0.9.114)", async () => {
  const { findShareLinks } = await import("@/lib/server/video/vault");
  it("어디에 있든 xhslink 를 찾고, 열쇠 값은 가린다", () => {
    const r = findShareLinks({ data: { note_list: [{ share_info: { link: "http://xhslink.com/o/AbC123", title: "x" }, web_link: "https://www.xiaohongshu.com/discovery/item/6d?xsec_token=SECRET&a=1" }] } });
    expect(r.short).toEqual(["http://xhslink.com/o/AbC123"]);
    expect(r.others.join()).not.toContain("SECRET");
    expect(findShareLinks({ desc: "공유 http://xhslink.cn/o/Zz9 링크" }).short).toEqual(["http://xhslink.cn/o/Zz9"]);
  });
});
