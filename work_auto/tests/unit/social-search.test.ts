import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 영상 검색 비용 정책 (v0.9.32) — docs/SOCIAL_VIDEO_SOURCING.md
 * 업체·AI 는 가짜로 바꿔 '몇 번 부르는지'를 센다. 목표: 검색 1번 = TikHub 1회, 저장 = 0회, 다운로드 = 필요할 때만.
 */
const ai = { generateStructured: vi.fn() };
const douyin = { searchVideos: vi.fn(), resolveShareUrl: vi.fn() };
const xhs = { searchVideos: vi.fn(), getVideoDetail: vi.fn() };

vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ai,
  getDouyinProvider: async () => douyin,
  getXiaohongshuSearchProvider: async () => xhs,
}));
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u_test" }));

const { socialSearchService, hasHangul, clearSocialSearchCache } = await import("@/lib/server/services/social-search");
const { resolveDouyin, clearDouyinResolveCache } = await import("@/lib/server/providers/douyin/douyin-resolver");
const { parseAweme, parseDouyinSearch, parseDouyinOne } = await import("@/lib/server/providers/douyin/parse");
const { detectPlatform, parseVideoLinks, douyinId, canDirectDownload } = await import("@/lib/video-links");
const { TikHubError } = await import("@/lib/server/providers/tikhub/client");

const xhsNote = (i: number, keyword: string) => ({
  noteId: (String(i).padStart(4, "0") + "a".repeat(20)).slice(0, 24),
  xsecToken: "t",
  url: `https://www.xiaohongshu.com/discovery/item/${i}`,
  title: `${keyword} ${i}`,
  desc: null,
  author: "작성자",
  coverUrl: "https://sns-img.xhscdn.com/c.jpg",
  publishedAt: new Date().toISOString(),
  likes: 10,
  comments: 1,
  collects: 2,
  durationSec: 30,
});
/** 가짜 샤오홍슈: 한 페이지 n개, 다음 페이지 있음 */
function xhsReturns(n: number) {
  xhs.searchVideos.mockImplementation(async ({ keyword, page }: { keyword: string; page: number }) => ({
    notes: Array.from({ length: n }, (_, i) => xhsNote((page - 1) * n + i, keyword)),
    rawCount: n,
    searchId: "s",
    sessionId: "ss",
    hasMore: true,
  }));
}
const dyVideo = (i: number, keyword: string) => ({
  awemeId: `74${String(i).padStart(17, "0")}`,
  title: `${keyword} 抖音 ${i}`,
  desc: null,
  author: "抖音用户",
  coverUrl: "https://p3.douyinpic.com/c.jpg",
  shareUrl: `https://www.iesdouyin.com/share/video/74${String(i).padStart(17, "0")}/`,
  publishedAt: new Date().toISOString(),
  durationSec: 20,
  likes: 5,
  comments: 1,
  collects: 1,
  shares: 1,
  playUrls: [`https://v3.douyinvod.com/${i}.mp4`],
});
function douyinReturns(n: number) {
  douyin.searchVideos.mockImplementation(async ({ keyword, cursor }: { keyword: string; cursor: number }) => ({
    videos: Array.from({ length: n }, (_, i) => dyVideo(cursor + i, keyword)),
    rawCount: n,
    cursor: cursor + n,
    searchId: "sid",
    hasMore: true,
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  clearSocialSearchCache();
  clearDouyinResolveCache();
  const { xhsSearchServiceCacheClear } = await import("@/lib/server/services/xhs-search");
  xhsSearchServiceCacheClear();
  ai.generateStructured.mockResolvedValue({ data: { primary_zh: "无线吸尘器" }, provider: "mock", model: "m" });
});

describe("비용 정책: 검색 1번 = TikHub 1회", () => {
  it("한글이 있을 때만 변환", () => {
    expect(hasHangul("무선청소기")).toBe(true);
    expect(hasHangul("无线吸尘器")).toBe(false);
    expect(hasHangul("dyson v12")).toBe(false);
  });

  it("① 샤오홍슈 검색: AI 변환 1회 + 검색 1회, 한 페이지 결과는 모두 (자동 다음 페이지 없음)", async () => {
    xhsReturns(6);
    const r = await socialSearchService.search({ keyword: "무선청소기", platform: "xiaohongshu", period: "all" });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(xhs.searchVideos).toHaveBeenCalledTimes(1);
    expect(xhs.searchVideos.mock.calls[0][0]).toMatchObject({ keyword: "无线吸尘器", page: 1 });
    expect(r.items).toHaveLength(6); // 6개여도 더 부르지 않는다
    expect(r.calls).toBe(1);
    expect(r.translation).toEqual({ original: "무선청소기", query: "无线吸尘器", translated: true });
    expect(r.next).toMatchObject({ page: 2, searchId: "s", sessionId: "ss", query: "无线吸尘器" });
  });

  it("② 도우인 검색 1회, 같은 검색어 번역은 다시 안 부름 (플랫폼을 바꿔도)", async () => {
    xhsReturns(6);
    douyinReturns(10);
    await socialSearchService.search({ keyword: "무선청소기", platform: "xiaohongshu" });
    const r = await socialSearchService.search({ keyword: "무선청소기", platform: "douyin", sort: "likes", period: "7" });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(douyin.searchVideos).toHaveBeenCalledTimes(1);
    expect(douyin.searchVideos.mock.calls[0][0]).toMatchObject({ keyword: "无线吸尘器", cursor: 0, sort: "likes", publishTime: "7" });
    expect(r.items).toHaveLength(10);
  });

  it("③ 같은 조건 다시 검색 → TikHub 0회 (서버 30분 기억)", async () => {
    xhsReturns(6);
    douyinReturns(10);
    await socialSearchService.search({ keyword: "无线吸尘器", platform: "xiaohongshu" });
    await socialSearchService.search({ keyword: "无线吸尘器", platform: "douyin" });
    const a = await socialSearchService.search({ keyword: "无线吸尘器", platform: "xiaohongshu" });
    const b = await socialSearchService.search({ keyword: "无线吸尘器", platform: "douyin" });
    expect(xhs.searchVideos).toHaveBeenCalledTimes(1);
    expect(douyin.searchVideos).toHaveBeenCalledTimes(1);
    expect([a.calls, b.calls]).toEqual([0, 0]);
    expect(ai.generateStructured).not.toHaveBeenCalled(); // 중국어 입력은 AI 없음
  });

  it("④ [더 보기] = 다음 페이지 1회 (번역 다시 안 함)", async () => {
    douyinReturns(10);
    const first = await socialSearchService.search({ keyword: "무선청소기", platform: "douyin" });
    const more = await socialSearchService.search({ keyword: "무선청소기", platform: "douyin", next: first.next });
    expect(douyin.searchVideos).toHaveBeenCalledTimes(2);
    expect(douyin.searchVideos.mock.calls[1][0]).toMatchObject({ keyword: "无线吸尘器", cursor: 10, searchId: "sid" });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(more.items[0].sourceId).not.toBe(first.items[0].sourceId);
  });

  it("21·30일: 업체는 반년으로 1회만 받고 게시일로 거른다 (모자라도 자동 추가 호출 없음)", async () => {
    douyin.searchVideos.mockResolvedValue({
      videos: [{ ...dyVideo(1, "x"), publishedAt: new Date(Date.now() - 100 * 86_400_000).toISOString() }, dyVideo(2, "x")],
      rawCount: 2,
      cursor: 2,
      hasMore: true,
    });
    const r = await socialSearchService.search({ keyword: "x", platform: "douyin", period: "21" });
    expect(douyin.searchVideos).toHaveBeenCalledTimes(1);
    expect(douyin.searchVideos.mock.calls[0][0].publishTime).toBe("180");
    expect(r.items).toHaveLength(1);
    expect(r.filteredByDate).toBe(true);
  });

  it("자동 변환을 끄면 한국어도 그대로, 변환 실패하면 원문으로 1회", async () => {
    xhsReturns(3);
    await socialSearchService.search({ keyword: "가습기", platform: "xiaohongshu", autoTranslate: false });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    ai.generateStructured.mockRejectedValue(new Error("AI 오류"));
    const r = await socialSearchService.search({ keyword: "새 검색어", platform: "xiaohongshu" });
    expect(r.translationError).toContain("검색어 자동 변환에 실패했습니다");
    expect(xhs.searchVideos.mock.calls.at(-1)![0]).toMatchObject({ keyword: "새 검색어" });
  });

  it("플랫폼은 하나만 (둘 다 없음), 오류는 플랫폼 이름과 함께", async () => {
    await expect(socialSearchService.search({ keyword: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(socialSearchService.search({ keyword: "x", platform: "both" })).rejects.toMatchObject({ code: "VALIDATION" });
    douyin.searchVideos.mockRejectedValue(new TikHubError("PAYMENT", "TikHub 잔액이 부족합니다."));
    await expect(socialSearchService.search({ keyword: "x", platform: "douyin" })).rejects.toMatchObject({ code: "TIKHUB_PAYMENT", status: 402 });
  });

  it("⑥ 도우인: 검색 응답의 재생 주소를 기억 → 바로 다운로드해도 Resolver 0회, 처음 보는 링크만 1회", async () => {
    douyinReturns(2);
    const r = await socialSearchService.search({ keyword: "x", platform: "douyin" });
    const v = await resolveDouyin(r.items[0].originalUrl);
    expect(v.playUrls).toHaveLength(1);
    expect(douyin.resolveShareUrl).not.toHaveBeenCalled();
    douyin.resolveShareUrl.mockResolvedValue(dyVideo(99, "y"));
    await resolveDouyin("https://v.douyin.com/abc/");
    await resolveDouyin("https://v.douyin.com/abc/"); // 다시 받아도 기억 (20분)
    expect(douyin.resolveShareUrl).toHaveBeenCalledTimes(1);
  });
});

describe("도우인 응답 읽기 (TikHub)", () => {
  const aweme = {
    aweme_id: "7412345678901234567",
    desc: "戴森V12测评\n#好物推荐",
    create_time: 1791000000,
    author: { nickname: "小明" },
    video: { duration: 42500, play_addr: { url_list: ["https://v3.douyinvod.com/a.mp4"] }, bit_rate: [{ play_addr: { url_list: ["https://v5.douyinvod.com/b.mp4", "https://v3.douyinvod.com/a.mp4"] } }], cover: { url_list: ["https://p3.douyinpic.com/c.jpg"] } },
    statistics: { digg_count: 12000, comment_count: 30, collect_count: 7, share_count: 9 },
    share_url: "https://www.iesdouyin.com/share/video/7412345678901234567/",
  };
  it("영상 1개: 제목 첫 줄, 길이 ms→초, 재생 주소는 응답에 있는 것만(중복 제거)", () => {
    expect(parseAweme(aweme)).toMatchObject({
      awemeId: "7412345678901234567",
      title: "戴森V12测评",
      author: "小明",
      durationSec: 43,
      likes: 12000,
      comments: 30,
      collects: 7,
      shares: 9,
      coverUrl: "https://p3.douyinpic.com/c.jpg",
      shareUrl: "https://www.iesdouyin.com/share/video/7412345678901234567/",
      publishedAt: new Date(1791000000 * 1000).toISOString(),
      playUrls: ["https://v3.douyinvod.com/a.mp4", "https://v5.douyinvod.com/b.mp4"],
    });
  });
  it("이미지 묶음·잘못된 ID 는 버린다", () => {
    expect(parseAweme({ aweme_id: "7412345678901234567", images: [{}], desc: "图文" })).toBeNull();
    expect(parseAweme({ aweme_id: "abc", desc: "x" })).toBeNull();
  });
  it("검색: business_data[].data.aweme_info, cursor·has_more·search_id", () => {
    const r = parseDouyinSearch({ code: 200, data: { business_data: [{ data: { aweme_info: aweme } }, { data: { aweme_info: aweme } }, { data: { other: 1 } }], cursor: 10, has_more: 1, search_id: "sid" } });
    expect(r.videos).toHaveLength(1);
    expect(r).toMatchObject({ rawCount: 3, cursor: 10, hasMore: true, searchId: "sid" });
  });
  it("공유 링크 1개: aweme_detail / 비면 null (그때만 Web 으로 다시)", () => {
    expect(parseDouyinOne({ data: { aweme_detail: aweme } })?.awemeId).toBe("7412345678901234567");
    expect(parseDouyinOne({ data: { aweme_detail: null, filter_list: [{}] } })).toBeNull();
  });
});

describe("CASE 4 도우인 링크 감지", () => {
  it("douyin.com · www · v.douyin.com · iesdouyin.com", () => {
    expect(detectPlatform("https://v.douyin.com/iRNBho6u/")).toBe("douyin");
    expect(detectPlatform("https://www.douyin.com/video/7412345678901234567")).toBe("douyin");
    expect(detectPlatform("https://douyin.com/video/7412345678901234567")).toBe("douyin");
    expect(detectPlatform("https://www.iesdouyin.com/share/video/7412345678901234567/")).toBe("douyin");
    expect(detectPlatform("https://notdouyin.com.example.org/x")).not.toBe("douyin");
    expect(detectPlatform("https://www.xiaohongshu.com/discovery/item/697c0eee000000000a03c308")).toBe("xiaohongshu");
    expect(canDirectDownload("douyin")).toBe(true);
    expect(canDirectDownload("youtube")).toBe(false);
  });
  it("앱 공유 문구에서 링크·제목만 뽑는다", () => {
    const text = "7.17 Kjc:/ 复制打开抖音，看看【小明的作品】戴森V12测评 # 好物推荐 https://v.douyin.com/iRNBho6u/ 07/23 J@v.Fh mdN:/";
    const [l] = parseVideoLinks(text);
    expect(l.url).toBe("https://v.douyin.com/iRNBho6u/");
    expect(l.titleHint).toContain("戴森V12测评");
    expect(l.titleHint).not.toMatch(/复制打开抖音|的作品|Kjc|mdN/);
  });
  it("긴 링크에서 영상 ID", () => {
    expect(douyinId("https://www.douyin.com/video/7412345678901234567")).toBe("7412345678901234567");
    expect(douyinId("https://www.douyin.com/jingxuan?modal_id=7412345678901234567")).toBe("7412345678901234567");
    expect(douyinId("https://v.douyin.com/iRNBho6u/")).toBeNull();
  });
});
