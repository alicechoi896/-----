import { describe, expect, it } from "vitest";
import { followShare, titleMix, promptTitles, cleanScriptExamples, SCRIPT_FORMAT_LIMITS } from "@/lib/script-format";
import { cleanDescription, pickRefs } from "@/lib/server/services/content-generation";

describe("제목 구성 · 설명글 정리 · 제목만 300개 (v0.9.50)", () => {
  it("포맷 제목이 있으면 AI 2 · 포맷 7 · 트렌드 1 (v0.9.153) / 100개 넘으면 1 · 8 · 1 / 없으면 AI 로", () => {
    expect(titleMix(10, 50, 10)).toEqual({ ai: 2, format: 7, trend: 1 });
    expect(titleMix(10, 150, 10)).toEqual({ ai: 1, format: 8, trend: 1 });
    expect(titleMix(10, 0, 10)).toEqual({ ai: 8, format: 0, trend: 2 });
    expect(titleMix(10, 50, 0)).toEqual({ ai: 3, format: 7, trend: 0 });
  });
  it("후보가 따라 한 포맷 원문: 포맷에 실제로 있는 것만, 띄어쓰기 달라도 같은 문장으로 (v0.9.153)", () => {
    const refs = pickRefs(
      [{ index: 1, model: "이거  모르면 손해" }, { index: 2, model: "포맷에 없는 문장" }, { index: 9, model: "이거 모르면 손해" }],
      ["청소기 모르면 손해", "두 번째 후보"],
      ["이거 모르면 손해", "사기 전 3가지"],
    );
    expect(refs).toEqual({ "청소기 모르면 손해": "이거 모르면 손해" });
    expect(followShare(null)).toBe(0);
    expect(followShare({ hooks: ["a"] })).toBe(0.7);
  });
  it("포맷 제목은 매번 같은 5개가 아니라 무작위", () => {
    const ex = Array.from({ length: 60 }, (_, i) => ({ title: `제목 ${i}`, views: i, text: "" }));
    const runs = new Set(Array.from({ length: 5 }, () => promptTitles(ex, 20).join("|")));
    expect(runs.size).toBeGreaterThan(1);
    expect(promptTitles(ex, 20)).toHaveLength(20);
  });
  it("제목만 담은 참고는 300개, 대본 있는 참고는 30개", () => {
    const titles = Array.from({ length: 320 }, (_, i) => ({ title: `t${i}`, views: null, text: "" }));
    const scripts = Array.from({ length: 40 }, (_, i) => ({ title: "", views: null, text: `대본 ${i}` }));
    const out = cleanScriptExamples([...titles, ...scripts]);
    expect(out.filter((e) => !e.text).length).toBe(SCRIPT_FORMAT_LIMITS.titleOnly);
    expect(out.filter((e) => e.text).length).toBe(SCRIPT_FORMAT_LIMITS.examples);
  });
  it("설명글의 안내 문장·항목 이름을 지운다", () => {
    const d = cleanDescription("이 설명은 제품 설명입니다.\n핵심 요약: 가볍고 강한 청소기예요.\n\n추천 대상: 자취생\n\n더 자세한 건 링크에서 확인하세요!");
    expect(d).toBe("가볍고 강한 청소기예요.\n\n자취생\n\n더 자세한 건 링크에서 확인하세요!");
  });
});

describe("대본 포맷 따르기 (v0.9.65)", async () => {
  const { formatStrength, promptExamples } = await import("@/lib/script-format");
  const { chooseScriptFormat } = await import("@/lib/server/services/script-formats");
  it("항목 100개 이상이면 80%, 아니면 50%", () => {
    expect(formatStrength({ titlePatterns: Array(90).fill("t"), hooks: Array(10).fill("h") })).toEqual({ total: 100, heavy: true, ratio: 0.8 });
    expect(formatStrength({ hooks: ["h"] }).ratio).toBe(0.5);
  });
  it("큰 포맷은 참고 대본 5편·900자까지 보낸다", () => {
    const ex = Array.from({ length: 8 }, (_, i) => ({ title: "", views: i, text: "가".repeat(1200) }));
    expect(promptExamples(ex, true)).toHaveLength(5);
    expect(promptExamples(ex, true)[0].text.length).toBe(901);
    expect(promptExamples(ex)).toHaveLength(2);
  });
  it("기본(★) 포맷이 없으면 그 유형에서 항목이 가장 많은 포맷을 쓴다", () => {
    const base = { userId: "u", channelIds: [], examples: [], hooks: [], ctas: [], guideline: "", isDefault: false, createdAt: "", updatedAt: "" };
    const rows = [
      { ...base, id: "small", name: "작은", contentType: "product", titlePatterns: ["a"] },
      { ...base, id: "big", name: "큰", contentType: "product", titlePatterns: Array(120).fill("t") },
      { ...base, id: "info", name: "정보", contentType: "info", titlePatterns: Array(300).fill("t") },
    ] as never[];
    expect(chooseScriptFormat(rows, "product", "youtube", "", null)?.id).toBe("big");
  });
});

describe("평점 이야기 거르기 (v0.9.154)", async () => {
  const { isRatingTalk } = await import("@/lib/script-format");
  it("평점·별점·리뷰 수·판매량·순위는 걸러 낸다", () => {
    for (const t of ["평점 4.8점", "별점 만점 후기", "리뷰 12,000개", "3만 개 후기가 증명", "누적 판매 10만", "쿠팡 1위", "베스트셀러 등극", "★4.9"]) expect(isRatingTalk(t)).toBe(true);
  });
  it("기능·상황 이야기는 그대로", () => {
    for (const t of ["380g이라 가방에 쏙", "소음이 도서관 수준", "필터 물세척 가능", "30분 만에 방 전체 제습", "주위 소음 걱정 없어요"]) expect(isRatingTalk(t)).toBe(false);
  });
});
