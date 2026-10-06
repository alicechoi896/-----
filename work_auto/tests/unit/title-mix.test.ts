import { describe, expect, it } from "vitest";
import { titleMix, promptTitles, cleanScriptExamples, SCRIPT_FORMAT_LIMITS } from "@/lib/script-format";
import { cleanDescription } from "@/lib/server/services/content-generation";

describe("제목 구성 · 설명글 정리 · 제목만 300개 (v0.9.50)", () => {
  it("포맷 제목 100개 이하: AI 4 · 포맷 4 · 트렌드 2 / 넘으면 2 · 7 · 1 / 없으면 AI 로", () => {
    expect(titleMix(10, 50, 10)).toEqual({ ai: 4, format: 4, trend: 2 });
    expect(titleMix(10, 150, 10)).toEqual({ ai: 2, format: 7, trend: 1 });
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
