import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 인스타그램 트렌드 찾기 (v0.9.53) — 응답 읽기 + 비용 규칙: [검색] 1번 = TikHub 1회, 같은 검색 30분 0회, 동시 요청 1번.
 */
const ig = { searchReels: vi.fn() };
vi.mock("@/lib/server/providers/registry", () => ({ getInstagramProvider: async () => ig }));
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u_test" }));

const { parseReelSearch } = await import("@/lib/server/providers/instagram/parse");
const { instagramTrendService, clearInstagramCache } = await import("@/lib/server/services/instagram-trends");

beforeEach(() => {
  clearInstagramCache();
  vi.clearAllMocks();
  ig.searchReels.mockResolvedValue({ items: [{ code: "abc12", url: "u", caption: "x", hashtags: [], author: null, followers: null, plays: 1, likes: null, comments: null, postedAt: null, thumbnailUrl: null, durationSec: null }], next: "tok" });
});

describe("인스타그램 트렌드", () => {
  it("응답 어디에 있든 릴스를 읽는다 (캡션·해시태그·숫자·게시일·썸네일)", () => {
    const body = {
      code: 200,
      data: {
        items: [
          { media: { code: "DAbc123xyz", media_type: 2, caption: { text: "무선청소기 사기 전 꼭 보세요 #무선청소기 #자취템" }, play_count: 120000, like_count: 3400, comment_count: 56, taken_at: 1759900000, user: { username: "clean_lab", follower_count: 25000 }, image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/a.jpg" }] }, video_duration: 31.5 } },
          { media: { code: "DAbc123xyz", media_type: 2 } }, // 중복
          { media: { code: "photo1", media_type: 1 } }, // 사진은 뺀다
        ],
        pagination_token: "next1",
        has_more: true,
      },
    };
    const r = parseReelSearch(body);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ code: "DAbc123xyz", url: "https://www.instagram.com/reel/DAbc123xyz/", plays: 120000, likes: 3400, comments: 56, author: "clean_lab", followers: 25000, durationSec: 32 });
    expect(r.items[0].hashtags).toEqual(["무선청소기", "자취템"]);
    expect(r.items[0].postedAt).toBe(new Date(1759900000 * 1000).toISOString());
    expect(r.next).toBe("next1");
    expect(parseReelSearch({ data: { items: [], has_more: false, pagination_token: "x" } }).next).toBeNull();
  });

  it("[검색] 1번 = 1회, 같은 검색어 30분 0회, 동시 요청 1번, [더 보기] 1회", async () => {
    const a = await instagramTrendService.search({ keyword: "청소기" });
    expect(a.calls).toBe(1);
    const b = await instagramTrendService.search({ keyword: "청소기 " });
    expect(b.calls).toBe(0);
    expect(ig.searchReels).toHaveBeenCalledTimes(1);
    await Promise.all([1, 2, 3].map(() => instagramTrendService.search({ keyword: "자취템" })));
    expect(ig.searchReels).toHaveBeenCalledTimes(2);
    await instagramTrendService.search({ keyword: "청소기", next: a.next });
    expect(ig.searchReels).toHaveBeenCalledTimes(3);
    await expect(instagramTrendService.search({ keyword: " " })).rejects.toThrow();
  });
});
