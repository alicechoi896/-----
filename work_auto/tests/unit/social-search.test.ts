import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 영상 검색 (샤오홍슈·도우인·둘 다) — docs/SOCIAL_VIDEO_SOURCING.md
 * 업체·AI 는 가짜로 바꿔 '몇 번 부르는지'와 '어떤 검색어로 부르는지'를 확인한다.
 */
const ai = { generateStructured: vi.fn() };
const douyin = { searchVideos: vi.fn(), resolveShareUrl: vi.fn() };
const xhsSearch = vi.fn();

vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ai,
  getDouyinProvider: async () => douyin,
}));
vi.mock("@/lib/server/services/xhs-search", () => ({ xhsSearchService: { search: (...a: unknown[]) => xhsSearch(...a) } }));
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u_test" }));

const { socialSearchService, queryPlan, hasHangul, markSimilar, socialVideoSearchConfig, clearSocialSearchCache } = await import("@/lib/server/services/social-search");
const { parseAweme, parseDouyinSearch, parseDouyinOne } = await import("@/lib/server/providers/douyin/parse");
const { detectPlatform, parseVideoLinks, douyinId, canDirectDownload } = await import("@/lib/video-links");
const { TikHubError } = await import("@/lib/server/providers/tikhub/client");

/** 가짜 샤오홍슈: 검색어별 결과 수 */
function xhsReturns(counts: Record<string, number>) {
  xhsSearch.mockImplementation(async ({ keyword }: { keyword: string }) => ({
    notes: Array.from({ length: counts[keyword] ?? 0 }, (_, i) => ({
      noteId: `${keyword.length.toString(16).padStart(2, "0")}${String(i).padStart(22, "0")}`.slice(0, 24),
      xsecToken: "t",
      url: `https://www.xiaohongshu.com/discovery/item/${i}?kw=${encodeURIComponent(keyword)}`,
      title: `${keyword} ${i}`,
      desc: null,
      author: "작성자",
      coverUrl: null,
      publishedAt: new Date().toISOString(),
      likes: 10,
      comments: 1,
      collects: 2,
      durationSec: 30 + i,
    })),
    next: null,
    calls: 1,
    filteredByDate: false,
  }));
}
/** 가짜 도우인: 검색어별 결과 수 (한 페이지, 더 없음) */
function douyinReturns(counts: Record<string, number>) {
  douyin.searchVideos.mockImplementation(async ({ keyword }: { keyword: string }) => ({
    videos: Array.from({ length: counts[keyword] ?? 0 }, (_, i) => ({
      awemeId: `7${String(keyword.length).padStart(3, "0")}${String(i).padStart(15, "0")}`,
      title: `${keyword} 抖音 ${i}`,
      desc: null,
      author: "抖音用户",
      coverUrl: null,
      shareUrl: `https://www.douyin.com/video/7${i}`,
      publishedAt: new Date().toISOString(),
      durationSec: 20,
      likes: 5,
      comments: 1,
      collects: 1,
      shares: 1,
      playUrls: [],
    })),
    rawCount: counts[keyword] ?? 0,
    hasMore: false,
  }));
}
const translation = { original: "다이슨 무선청소기", primary_zh: "戴森 无线吸尘器", alternate_zh: "Dyson 无线吸尘器", english: "Dyson cordless vacuum" };

beforeEach(() => {
  vi.clearAllMocks();
  ai.generateStructured.mockResolvedValue({ data: translation, provider: "mock", model: "m" });
});

describe("검색어 변환·순서", () => {
  it("한글이 있을 때만 변환 대상", () => {
    expect(hasHangul("다이슨 청소기")).toBe(true);
    expect(hasHangul("戴森 吸尘器")).toBe(false);
    expect(hasHangul("dyson v12")).toBe(false);
  });
  it("순서: 1순위 → 보조 → 영어 (영어는 끌 수 있다)", () => {
    const t = { original: "x", primaryZh: "甲", alternateZh: "乙", english: "a", translated: true };
    expect(queryPlan(t).map((q) => q.type)).toEqual(["primary", "alternate", "english"]);
    expect(queryPlan(t, false).map((q) => q.type)).toEqual(["primary", "alternate"]);
    expect(queryPlan({ ...t, translated: false })).toEqual([{ query: "x", type: "original" }]);
  });
});

describe("CASE 1·2·3·5·6·7·8 검색 흐름", () => {
  // 도우인 검색·변환은 서버 메모리에 기억 → 테스트마다 비운다 (CASE 2 는 CASE 1 의 변환 기억을 확인)
  beforeEach((ctx) => {
    if (!ctx.task.name.startsWith("CASE 2")) clearSocialSearchCache();
  });
  it("CASE 1 샤오홍슈: 한국어 → AI 1회 → 1순위 검색어로 검색", async () => {
    xhsReturns({ "戴森 无线吸尘器": 20 });
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["xiaohongshu"], sort: "general", period: "21" });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(r.translation).toMatchObject({ translated: true, primaryZh: "戴森 无线吸尘器", alternateZh: "Dyson 无线吸尘器" });
    expect(xhsSearch).toHaveBeenCalledTimes(1);
    expect(xhsSearch.mock.calls[0][0]).toMatchObject({ keyword: "戴森 无线吸尘器", period: "21" });
    expect(r.platforms[0].items).toHaveLength(20);
    expect(r.platforms[0].items[0]).toMatchObject({ platform: "xiaohongshu", queryType: "primary", matchedQuery: "戴森 无线吸尘器", shareCount: null });
  });

  it("CASE 2 도우인: 같은 변환 결과 사용(기억), 7일은 업체 7, 21일은 180 으로 받아 다시 거름", async () => {
    douyinReturns({ "戴森 无线吸尘器": 16 });
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["douyin"], sort: "likes", period: "7" });
    expect(ai.generateStructured).toHaveBeenCalledTimes(0); // CASE 1 에서 변환한 것을 기억 (사용자별 서버 메모리)
    expect(douyin.searchVideos.mock.calls[0][0]).toMatchObject({ keyword: "戴森 无线吸尘器", sort: "likes", publishTime: "7", cursor: 0 });
    expect(r.platforms[0].items[0]).toMatchObject({ platform: "douyin", queryType: "primary" });
    await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["douyin"], sort: "latest", period: "21" });
    expect(douyin.searchVideos.mock.calls.at(-1)![0]).toMatchObject({ publishTime: "180", sort: "latest" });
  });

  it("CASE 3 둘 다: 변환 1번, 두 플랫폼 동시에, 결과마다 플랫폼 표시", async () => {
    xhsReturns({ 吸尘器测评: 18 });
    douyinReturns({ 吸尘器测评: 15 });
    ai.generateStructured.mockResolvedValue({ data: { original: "청소기 리뷰", primary_zh: "吸尘器测评", alternate_zh: "吸尘器推荐", english: "vacuum review" }, provider: "mock", model: "m" });
    const r = await socialSearchService.search({ keyword: "청소기 리뷰", platforms: ["xiaohongshu", "douyin"] });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(r.platforms.map((p) => p.platform)).toEqual(["xiaohongshu", "douyin"]);
    expect(r.platforms[0].items.every((i) => i.platform === "xiaohongshu")).toBe(true);
    expect(r.platforms[1].items.every((i) => i.platform === "douyin")).toBe(true);
  });

  it("CASE 5 중국어로 넣으면 AI 를 부르지 않고 그대로", async () => {
    xhsReturns({ 空气炸锅: 20 });
    const r = await socialSearchService.search({ keyword: "空气炸锅", platforms: ["xiaohongshu"] });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(r.translation.translated).toBe(false);
    expect(r.platforms[0].queriesUsed).toEqual([{ query: "空气炸锅", type: "original", count: 20 }]);
  });

  it("자동 변환을 끄면 한국어도 그대로", async () => {
    xhsReturns({ 가습기: 3 });
    await socialSearchService.search({ keyword: "가습기", platforms: ["xiaohongshu"], autoTranslate: false });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(xhsSearch.mock.calls[0][0]).toMatchObject({ keyword: "가습기" });
  });

  it("CASE 6 1순위로 20개면 보조 검색어를 부르지 않는다", async () => {
    xhsReturns({ "戴森 无线吸尘器": 20, "Dyson 无线吸尘器": 20 });
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["xiaohongshu"] });
    expect(xhsSearch).toHaveBeenCalledTimes(1);
    expect(r.platforms[0].queriesUsed.map((q) => q.type)).toEqual(["primary"]);
  });

  it(`CASE 7 샤오홍슈 20 · 도우인 5 → 도우인만 보조 검색 (기준 ${socialVideoSearchConfig.minimumUsefulResults}개)`, async () => {
    xhsReturns({ "戴森 无线吸尘器": 20, "Dyson 无线吸尘器": 20 });
    douyinReturns({ "戴森 无线吸尘器": 5, "Dyson 无线吸尘器": 12 });
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["xiaohongshu", "douyin"] });
    expect(xhsSearch.mock.calls.map((c) => c[0].keyword)).toEqual(["戴森 无线吸尘器"]);
    expect(douyin.searchVideos.mock.calls.map((c) => c[0].keyword)).toEqual(["戴森 无线吸尘器", "Dyson 无线吸尘器"]);
    const d = r.platforms[1];
    expect(d.items).toHaveLength(17);
    expect(d.queriesUsed.map((q) => q.type)).toEqual(["primary", "alternate"]);
    expect(d.items.at(-1)!.queryType).toBe("alternate");
  });

  it("보조로도 모자라면 영어까지, 같은 영상은 한 번만", async () => {
    douyin.searchVideos.mockImplementation(async ({ keyword }: { keyword: string }) => ({
      videos: [{ awemeId: "7000000000000000001", title: keyword, desc: null, author: null, coverUrl: null, shareUrl: "https://www.douyin.com/video/7000000000000000001", publishedAt: null, durationSec: null, likes: null, comments: null, collects: null, shares: null, playUrls: [] }],
      rawCount: 1,
      hasMore: false,
    }));
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["douyin"], period: "all" });
    expect(douyin.searchVideos.mock.calls.map((c) => c[0].keyword)).toEqual(["戴森 无线吸尘器", "Dyson 无线吸尘器", "Dyson cordless vacuum"]);
    expect(r.platforms[0].items).toHaveLength(1);
  });

  it("CASE 8 도우인이 실패해도 샤오홍슈 결과는 그대로", async () => {
    xhsReturns({ "戴森 无线吸尘器": 20 });
    douyin.searchVideos.mockRejectedValue(new TikHubError("PAYMENT", "TikHub 잔액이 부족합니다."));
    const r = await socialSearchService.search({ keyword: "다이슨 무선청소기", platforms: ["xiaohongshu", "douyin"] });
    expect(r.platforms[0]).toMatchObject({ platform: "xiaohongshu", error: null });
    expect(r.platforms[0].items).toHaveLength(20);
    expect(r.platforms[1].items).toHaveLength(0);
    expect(r.platforms[1].error).toMatchObject({ code: "TIKHUB_PAYMENT" });
    expect(r.platforms[1].error!.message).toContain("도우인 검색에 실패했습니다");
  });

  it("변환 실패 → 안내하고 원문으로 검색", async () => {
    ai.generateStructured.mockRejectedValue(new Error("AI 오류"));
    xhsReturns({ "새로운 검색어": 2 });
    const r = await socialSearchService.search({ keyword: "새로운 검색어", platforms: ["xiaohongshu"] });
    expect(r.translationError).toContain("검색어 자동 변환에 실패했습니다");
    expect(xhsSearch.mock.calls[0][0]).toMatchObject({ keyword: "새로운 검색어" });
  });

  it("[더 보기]: 번역·다른 플랫폼 없이 그 플랫폼·검색어만", async () => {
    douyinReturns({ 吸尘器: 3 });
    const r = await socialSearchService.search({ keyword: "아무거나", continue: { platform: "douyin", next: { query: "吸尘器", queryType: "alternate", cursor: 20, searchId: "s" } } });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(xhsSearch).not.toHaveBeenCalled();
    expect(douyin.searchVideos.mock.calls[0][0]).toMatchObject({ keyword: "吸尘器", cursor: 20, searchId: "s" });
    expect(r.platforms[0].items[0].queryType).toBe("alternate");
  });

  it("검색어·플랫폼 검사", async () => {
    await expect(socialSearchService.search({ keyword: " " })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(socialSearchService.search({ keyword: "x", platforms: ["tiktok"] })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("다른 플랫폼의 비슷한 영상: 지우지 않고 표시만", () => {
  it("제목이 비슷하고 길이가 ±2초면 같은 묶음", () => {
    const base = { sourceId: "", desc: null, authorName: null, thumbnailUrl: null, originalUrl: "", publishedAt: null, likeCount: null, commentCount: null, collectCount: null, shareCount: null, matchedQuery: "", queryType: "primary" as const, similarGroup: null };
    const a = { ...base, platform: "xiaohongshu" as const, sourceId: "a", title: "戴森V12真实测评 用了一个月", durationSec: 40 };
    const b = { ...base, platform: "douyin" as const, sourceId: "b", title: "戴森V12真实测评，用了一个月！", durationSec: 41 };
    const c = { ...base, platform: "douyin" as const, sourceId: "c", title: "空气炸锅食谱", durationSec: 40 };
    const res = [
      { platform: "xiaohongshu" as const, items: [a], error: null, calls: 0, queriesUsed: [], next: null },
      { platform: "douyin" as const, items: [b, c], error: null, calls: 0, queriesUsed: [], next: null },
    ];
    markSimilar(res);
    expect(a.similarGroup).toBeTruthy();
    expect(b.similarGroup).toBe(a.similarGroup);
    expect(c.similarGroup).toBeNull();
    expect(res[1].items).toHaveLength(2);
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
