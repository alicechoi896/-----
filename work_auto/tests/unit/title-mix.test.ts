import { describe, expect, it } from "vitest";
import { titleMix, promptTitles, cleanScriptExamples, SCRIPT_FORMAT_LIMITS } from "@/lib/script-format";
import { cleanDescription } from "@/lib/server/services/content-generation";

describe("제목 구성 · 설명글 정리 · 제목만 300개 (v0.9.50)", () => {
  it("포맷 제목 100개 이하: AI 4 · 포맷 4 · 트렌드 2 / 넘으면 1 · 8 · 1 (80%, v0.9.65) / 없으면 AI 로", () => {
    expect(titleMix(10, 50, 10)).toEqual({ ai: 4, format: 4, trend: 2 });
    expect(titleMix(10, 150, 10)).toEqual({ ai: 1, format: 8, trend: 1 });
    expect(titleMix(10, 0, 10)).toEqual({ ai: 8, format: 0, trend: 2 });
    expect(titleMix(10, 50, 0)).toEqual({ ai: 6, format: 4, trend: 0 });
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
