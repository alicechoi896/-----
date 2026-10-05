import { beforeEach, describe, expect, it, vi } from "vitest";

/** 검색 결과 제목 한국어 번역: 한 페이지 = AI 1회, 중국어만, id 로 짝 맞추기 (v0.9.33) */
const ai = { generateStructured: vi.fn() };
vi.mock("@/lib/server/providers/registry", () => ({ getAIProvider: async () => ai }));

const { titleTranslateService } = await import("@/lib/server/services/title-translate");
const { isChineseTitle, titleForTranslation } = await import("@/lib/social-title");
const { parseNote } = await import("@/lib/server/providers/xiaohongshu/parse");

beforeEach(() => {
  vi.clearAllMocks();
  ai.generateStructured.mockImplementation(async ({ variables }: { variables: { items: { id: string; title: string }[] } }) => ({
    // 순서를 뒤집어 돌려줘도 id 로 맞춘다
    data: { items: [...variables.items].reverse().map((i) => ({ id: i.id, translatedTitle: `번역:${i.title}` })) },
    provider: "mock",
    model: "m",
  }));
});

describe("번역 대상", () => {
  it("중국어 비중이 높은 제목만 (한국어·영어는 그대로)", () => {
    expect(isChineseTitle("AirPods5取耳机技巧")).toBe(true);
    expect(isChineseTitle("一则开箱")).toBe(true);
    expect(isChineseTitle("에어팟5 꿀팁 取耳机")).toBe(false);
    expect(isChineseTitle("AirPods Pro unboxing review")).toBe(false);
    expect(isChineseTitle("Dyson V12 Detect Slim 测")).toBe(false); // 한자 1자
  });
  it("해시태그·줄바꿈은 빼고 제목만", () => {
    expect(titleForTranslation("无线吸尘器测评\n#好物推荐 #开箱")).toBe("无线吸尘器测评");
  });
});

describe("묶어서 1회", () => {
  it("제목 10개 → AI 1회, id 로 매핑, 영어·한국어는 보내지 않음", async () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `xiaohongshu:${i}`, title: `无线吸尘器测评 第${i}期` })),
      { id: "douyin:en", title: "Vacuum unboxing" },
      { id: "douyin:ko", title: "청소기 리뷰" },
    ];
    const r = await titleTranslateService.translate({ items });
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    const sent = ai.generateStructured.mock.calls[0][0].variables.items as { id: string }[];
    expect(sent).toHaveLength(10);
    expect(sent.some((s) => s.id.endsWith("en") || s.id.endsWith("ko"))).toBe(false);
    expect(r.items).toHaveLength(10);
    expect(r.items.find((x) => x.id === "xiaohongshu:3")!.translatedTitle).toBe("번역:无线吸尘器测评 第3期");
  });
  it("번역할 중국어 제목이 없으면 AI 0회", async () => {
    const r = await titleTranslateService.translate({ items: [{ id: "a", title: "Hello world" }] });
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(r.items).toEqual([]);
  });
  it("모르는 id 는 버린다", async () => {
    ai.generateStructured.mockResolvedValue({ data: { items: [{ id: "zzz", translatedTitle: "x" }, { id: "a", translatedTitle: "청소기" }] }, provider: "m", model: "m" });
    const r = await titleTranslateService.translate({ items: [{ id: "a", title: "吸尘器测评" }] });
    expect(r.items).toEqual([{ id: "a", translatedTitle: "청소기" }]);
  });
});

describe("샤오홍슈 검색 응답의 재생 주소 (있으면 미리보기에 바로 사용)", () => {
  it("video_info_v2.media.stream.h264[].master_url", () => {
    const n = parseNote({
      note: {
        id: "697c0eee000000000a03c308",
        type: "video",
        display_title: "AirPods5取耳机技巧",
        video_info_v2: { media: { stream: { h265: [{ master_url: "https://sns-video.xhscdn.com/h265.mp4" }], h264: [{ master_url: "http://sns-video.xhscdn.com/h264.mp4" }] } } },
      },
    });
    expect(n?.previewUrl).toBe("https://sns-video.xhscdn.com/h264.mp4");
    expect(parseNote({ note: { id: "697c0eee000000000a03c309", type: "video", display_title: "x" } })?.previewUrl).toBeNull();
  });
});
