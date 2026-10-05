import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Keyword Intelligence (v0.9.40) — docs/KEYWORD_INTELLIGENCE.md
 * 플랫폼은 가짜로 바꿔 '몇 번 부르는지'를 센다. 목표: 생성 1번 = YouTube search+videos 1세트 / NAVER 블로그 검색 1 + 데이터랩 1.
 */
const yt = { keywordEvidence: vi.fn() };
const nv = { blogEvidence: vi.fn(), relativeInterest: vi.fn() };
vi.mock("@/lib/server/providers/registry", () => ({
  getYouTubeTrendProvider: async () => yt,
  getNaverTrendProvider: async () => nv,
}));

const { keywordIntelligence, clearKeywordIntelCache, pickSeed, platformOf } = await import("@/lib/server/services/keyword-intelligence");

const video = (title: string, tags: string[] = []) => ({ title, description: "", tags, views: 10_000, publishedAt: new Date().toISOString() });

beforeEach(() => {
  clearKeywordIntelCache();
  vi.clearAllMocks();
  yt.keywordEvidence.mockResolvedValue([
    video("갤럭시 s26 카메라 실사용 후기", ["갤럭시 s26", "카메라"]),
    video("갤럭시 s26 카메라 비교 아이폰", ["갤럭시 s26"]),
    video("갤럭시 s26 배터리 실사용", ["배터리"]),
    video("s26 카메라 설정 꿀팁", ["카메라"]),
  ]);
  nv.blogEvidence.mockResolvedValue([
    { title: "캠핑 의자 추천 가벼운 것", description: "캠핑 의자 고르는 법", postdate: "20261001" },
    { title: "캠핑 의자 추천 후기", description: "", postdate: "20260901" },
    { title: "가벼운 캠핑 의자 비교", description: "", postdate: "20260801" },
  ]);
  nv.relativeInterest.mockResolvedValue({ "캠핑 의자": { avg: 60, recent: 80, previous: 50 } });
});

describe("Keyword Intelligence", () => {
  it("기능별 플랫폼·검색어", () => {
    expect(platformOf("yt-product-video")).toBe("youtube");
    expect(platformOf("clip-info-content")).toBe("naver");
    expect(platformOf("blog-product-writing")).toBe("naver");
    expect(pickSeed("yt-product-video", { keywords: ["갤럭시 s26"] }, { productName: "삼성 폰" })).toBe("갤럭시 s26");
    expect(pickSeed("yt-product-video", {}, { productName: "삼성 폰" })).toBe("삼성 폰");
    expect(pickSeed("blog-product-writing", { mainKeyword: "캠핑 의자" }, {})).toBe("캠핑 의자");
  });

  it("YouTube: 1번 생성 = keywordEvidence 1회(search.list+videos.list), 같은 검색어는 30분 동안 0회", async () => {
    const a = await keywordIntelligence.collect({ userId: "u", featureId: "yt-product-video", seed: "갤럭시 s26" });
    expect(yt.keywordEvidence).toHaveBeenCalledTimes(1);
    expect(a.source).toBe("youtube");
    expect(a.sampleSize).toBe(4);
    expect(a.candidates.length).toBeGreaterThan(0);
    expect(a.candidates[0].evidence).toContain("관련 영상 4개");
    await keywordIntelligence.collect({ userId: "u", featureId: "yt-info-video", seed: "갤럭시 s26" });
    expect(yt.keywordEvidence).toHaveBeenCalledTimes(1);
    expect(nv.blogEvidence).not.toHaveBeenCalled();
  });

  it("동시에 같은 요청이 와도 1회", async () => {
    await Promise.all([1, 2, 3].map(() => keywordIntelligence.collect({ userId: "u", featureId: "yt-product-video", seed: "갤럭시 s26" })));
    expect(yt.keywordEvidence).toHaveBeenCalledTimes(1);
  });

  it("NAVER: 블로그 검색 1회 + 데이터랩 1회(최대 5개), 상대 관심도만", async () => {
    const r = await keywordIntelligence.collect({ userId: "u", featureId: "blog-product-writing", seed: "캠핑 의자" });
    expect(nv.blogEvidence).toHaveBeenCalledTimes(1);
    expect(nv.relativeInterest).toHaveBeenCalledTimes(1);
    expect((nv.relativeInterest.mock.calls[0][0] as string[]).length).toBeLessThanOrEqual(5);
    expect(r.trendSignals[0]).toMatchObject({ keyword: "캠핑 의자", relativeInterest: 60, direction: "up" });
    expect(yt.keywordEvidence).not.toHaveBeenCalled();
  });

  it("실패해도 생성은 막지 않는다 (fallback_ai, 재시도 없음)", async () => {
    yt.keywordEvidence.mockRejectedValueOnce(new Error("quota"));
    const r = await keywordIntelligence.collect({ userId: "u", featureId: "yt-product-video", seed: "에어팟" });
    expect(r.source).toBe("fallback_ai");
    expect(r.note).toContain("AI 만으로");
    expect(yt.keywordEvidence).toHaveBeenCalledTimes(1);
  });

  it("검색어가 없으면 플랫폼 호출 0회", async () => {
    const r = await keywordIntelligence.collect({ userId: "u", featureId: "yt-product-video", seed: " " });
    expect(r.source).toBe("fallback_ai");
    expect(yt.keywordEvidence).not.toHaveBeenCalled();
  });
});
