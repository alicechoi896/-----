import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 인스타그램 트렌드 찾기 (v0.9.53) — 응답 읽기 + 비용 규칙: [검색] 1번 = TikHub 1회, 같은 검색 30분 0회, 동시 요청 1번.
 */
const ig = { searchReels: vi.fn() };
const meta = { searchHashtag: vi.fn() };
let metaConnected = true;
vi.mock("@/lib/server/providers/registry", () => ({ getInstagramProvider: async () => ig, getMetaInstagramProvider: async () => (metaConnected ? meta : null), hasTikHub: async () => true }));
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u_test" }));

const { parseReelSearch } = await import("@/lib/server/providers/instagram/parse");
const { parseMetaMedia, toHashtag, MockMetaInstagramProvider, resetMockMetaQuota } = await import("@/lib/server/providers/instagram/meta-graph");
const { instagramTrendService, clearInstagramCache } = await import("@/lib/server/services/instagram-trends");

beforeEach(() => {
  clearInstagramCache();
  vi.clearAllMocks();
  metaConnected = true;
  meta.searchHashtag.mockResolvedValue({ items: [], next: "c1", quota: { used: 3, limit: 30 }, newHashtag: true, skipped: 2 });
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
    // 다음 페이지 토큰이 깊은 곳·다른 이름이어도 찾는다, 재생 주소
    const deep = parseReelSearch({ data: { data: { reels: [{ code: "Zz12345", product_type: "clips", video_versions: [{ url: "https://scontent.cdninstagram.com/v.mp4" }] }], paging_info: { next_max_id: "QVF123", more_available: true } } } });
    expect(deep.next).toBe("QVF123");
    expect(deep.items[0].videoUrl).toBe("https://scontent.cdninstagram.com/v.mp4");
  });

  it("[검색] 1번 = 1회, 같은 검색어 30분 0회, 동시 요청 1번, [더 보기] 1회", async () => {
    const a = await instagramTrendService.search({ keyword: "청소기", source: "tikhub" });
    expect(a.calls).toBe(1);
    const b = await instagramTrendService.search({ keyword: "청소기 ", source: "tikhub" });
    expect(b.calls).toBe(0);
    expect(ig.searchReels).toHaveBeenCalledTimes(1);
    await Promise.all([1, 2, 3].map(() => instagramTrendService.search({ keyword: "자취템", source: "tikhub" })));
    expect(ig.searchReels).toHaveBeenCalledTimes(2);
    await instagramTrendService.search({ keyword: "청소기", next: a.next, source: "tikhub" });
    expect(ig.searchReels).toHaveBeenCalledTimes(3);
    await expect(instagramTrendService.search({ keyword: " " })).rejects.toThrow();
  });
});

describe("인스타그램 공식 API 병행 (v0.9.57)", () => {
  it("해시태그 모양: #·띄어쓰기·기호를 뺀다", () => {
    expect(toHashtag("#무선 청소기!")).toBe("무선청소기");
    expect(toHashtag("갤럭시 워치 7")).toBe("갤럭시워치7");
    expect(toHashtag("  ")).toBe("");
  });
  it("Graph API 게시물: 영상만, permalink 에서 코드, 조회수·작성자 없음, media_url 로 재생", () => {
    const r = parseMetaMedia({ id: "1790", media_type: "VIDEO", permalink: "https://www.instagram.com/reel/DAbc1/", caption: "청소 끝 #자취템 #청소", like_count: 120, comments_count: 4, timestamp: "2026-10-01T10:00:00+0000", media_url: "https://video.cdn/x.mp4" });
    expect(r).toMatchObject({ code: "DAbc1", plays: null, author: null, likes: 120, comments: 4, videoUrl: "https://video.cdn/x.mp4" });
    expect(r?.hashtags).toEqual(["자취템", "청소"]);
    expect(parseMetaMedia({ id: "2", media_type: "IMAGE", permalink: "https://www.instagram.com/p/X1/" })).toBeNull();
  });
  it("기본은 공식 API: 해시태그로 바꿔 부르고, 같은 검색 30분 기억, TikHub 는 부르지 않는다", async () => {
    const a = await instagramTrendService.search({ keyword: "무선 청소기" });
    expect(a).toMatchObject({ source: "meta", hashtag: "무선청소기", calls: 1, quota: { used: 3, limit: 30 }, skipped: 2, next: "c1" });
    expect(meta.searchHashtag).toHaveBeenCalledWith("무선청소기", null, "top");
    expect((await instagramTrendService.search({ keyword: "무선청소기" })).calls).toBe(0);
    await instagramTrendService.search({ keyword: "무선청소기", kind: "recent" });
    expect(meta.searchHashtag).toHaveBeenLastCalledWith("무선청소기", null, "recent");
    expect(ig.searchReels).not.toHaveBeenCalled();
  });
  it("공식 API 가 연결되어 있지 않거나 한도를 넘으면 오류 (TikHub 로 자동으로 넘어가지 않음)", async () => {
    metaConnected = false;
    await expect(instagramTrendService.search({ keyword: "청소기" })).rejects.toMatchObject({ code: "META_NOT_CONNECTED" });
    metaConnected = true;
    const { MetaGraphError } = await import("@/lib/server/providers/instagram/meta-graph");
    meta.searchHashtag.mockRejectedValueOnce(new MetaGraphError("QUOTA", "한도"));
    await expect(instagramTrendService.search({ keyword: "새해시태그" })).rejects.toMatchObject({ code: "META_QUOTA" });
    expect(ig.searchReels).not.toHaveBeenCalled();
  });
  it("데모 공식 API: 같은 해시태그는 한도에 다시 안 세고, 31번째 새 해시태그는 거절", async () => {
    resetMockMetaQuota();
    const p = new MockMetaInstagramProvider();
    expect((await p.searchHashtag("a0")).newHashtag).toBe(true);
    expect((await p.searchHashtag("a0")).newHashtag).toBe(false);
    for (let i = 1; i < 30; i++) await p.searchHashtag(`a${i}`);
    expect((await p.searchHashtag("a5")).quota).toEqual({ used: 30, limit: 30 });
    await expect(p.searchHashtag("a30")).rejects.toMatchObject({ code: "QUOTA" });
    resetMockMetaQuota();
  });
});
