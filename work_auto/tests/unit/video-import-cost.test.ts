import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReferenceVideo } from "@/lib/types";

/** ⑤ 검색 결과에서 가져오기: 검색 응답의 메타로 저장 → 상세·Resolver API 0회 (v0.9.32 비용 정책) */
const resolveDouyin = vi.fn();
const resolveXiaohongshu = vi.fn();
const rows: ReferenceVideo[] = [];

vi.mock("@/lib/server/providers/douyin/douyin-resolver", () => ({ resolveDouyin: (...a: unknown[]) => resolveDouyin(...a) }));
vi.mock("@/lib/server/providers/video/xiaohongshu-resolver", () => ({ resolveXiaohongshu: (...a: unknown[]) => resolveXiaohongshu(...a) }));
vi.mock("@/lib/server/providers/registry", () => ({ getYouTubeTrendProvider: async () => ({ getVideoMeta: vi.fn() }) }));
vi.mock("@/lib/server/repositories", () => ({
  getCurrentUserId: async () => "u1",
  getRepositories: () => ({
    products: { get: async () => null },
    videos: {
      findUrls: vi.fn(async (_u: string, urls: string[]) => rows.filter((r) => urls.includes(r.url)).map((r) => r.url)),
      insert: async (v: ReferenceVideo) => (rows.push(v), v),
    },
  }),
}));

const { videoService } = await import("@/lib/server/services/videos");

beforeEach(() => {
  rows.length = 0;
  vi.clearAllMocks();
});

describe("검색 결과 가져오기 비용", () => {
  it("도우인·샤오홍슈 10개 저장: Resolver 0회, 저장 필드는 최소 (재생 주소 없음)", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      i % 2
        ? { url: `https://www.iesdouyin.com/share/video/74${String(i).padStart(17, "0")}/`, titleHint: `도우인 ${i}`, meta: { channelName: "抖音用户", durationSec: 21, thumbnailUrl: "https://p3.douyinpic.com/c.jpg" } }
        : { url: `https://www.xiaohongshu.com/discovery/item/${String(i).padStart(24, "a")}`, titleHint: `샤오홍슈 ${i}`, meta: { channelName: "小红薯", durationSec: 30, thumbnailUrl: "https://sns-img.xhscdn.com/c.jpg" } },
    );
    const res = await videoService.importMany(items, "메모", null);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(resolveDouyin).not.toHaveBeenCalled();
    expect(resolveXiaohongshu).not.toHaveBeenCalled();
    expect(rows).toHaveLength(10);
    const v = rows.find((r) => r.platform === "douyin")!;
    expect(v).toMatchObject({ title: "도우인 1", channelName: "抖音用户", durationSec: 21, thumbnailUrl: "https://p3.douyinpic.com/c.jpg", note: "메모" });
    expect(Object.keys(v).sort()).toEqual(["channelName", "createdAt", "durationSec", "id", "note", "platform", "productId", "thumbnailColor", "thumbnailUrl", "title", "url", "userId"]);
  });

  it("링크만 붙여 넣은 도우인은 정보가 없어 1회만 (A 조건), 이상한 썸네일 주소는 버린다", async () => {
    resolveDouyin.mockResolvedValue({ title: "제목", author: "작가", durationSec: 9, playUrls: ["https://x/1.mp4"] });
    await videoService.importMany([{ url: "https://v.douyin.com/abc/" }], undefined, null);
    expect(resolveDouyin).toHaveBeenCalledTimes(1);
    await videoService.importMany([{ url: "https://v.douyin.com/def/", titleHint: "검색 결과", meta: { thumbnailUrl: "javascript:alert(1)" } }], undefined, null);
    expect(resolveDouyin).toHaveBeenCalledTimes(1);
    expect(rows.at(-1)!.thumbnailUrl).toBeUndefined();
  });

  it("중복 확인은 한 번에 (영상마다 DB 를 읽지 않는다)", async () => {
    await videoService.importMany([{ url: "https://v.douyin.com/a1/", titleHint: "a", meta: {} }], undefined, null);
    const res = await videoService.importMany(
      [
        { url: "https://v.douyin.com/a1/", titleHint: "a", meta: {} },
        { url: "https://v.douyin.com/a2/", titleHint: "b", meta: {} },
      ],
      undefined,
      null,
    );
    expect(res.map((r) => r.ok)).toEqual([false, true]);
  });
});
