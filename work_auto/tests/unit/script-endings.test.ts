import { describe, expect, it } from "vitest";
import { endingTarget, guidelineBansYo, yoRatio } from "@/lib/script-format";

/** v0.9.90: 대본 포맷 말끝 — 가이드라인의 '~요 금지'를 강한 규칙으로, 결과 검사 */
describe("대본 포맷 말끝", () => {
  it("가이드라인의 '~요 금지' 표현을 알아본다", () => {
    for (const t of ["문장은 요로 끝내지 않는다", "~요 금지", "말끝: 요로 끝나지 말 것", "반말로 쓴다", "요체 쓰지 않기"]) expect(guidelineBansYo(t), t).toBe(true);
    for (const t of ["Hook 은 질문형으로", "요약은 짧게", "필요한 요소만"]) expect(guidelineBansYo(t), t).toBe(false);
  });
  it("가이드라인 금지 > 참고 대본 분포 순으로 목표를 정한다", () => {
    expect(endingTarget({ examples: [], guideline: "요로 끝내지 않는다" })).toMatchObject({ maxYo: 0.05 });
    expect(endingTarget({ examples: [], guideline: "요로 끝내지 않는다" }).rule).toContain("쓰지 않는다");
    const da = Array.from({ length: 4 }, () => "이거 미쳤다\n진짜 편함\n일단 써봐").map((text) => ({ text }));
    expect(endingTarget({ examples: da, guideline: "" }).maxYo).toBeCloseTo(0.05, 2);
    const yo = Array.from({ length: 4 }, () => "이거 좋아요\n진짜 편해요\n써보세요").map((text) => ({ text }));
    expect(endingTarget({ examples: yo, guideline: "" }).maxYo).toBeNull();
    expect(endingTarget(null)).toEqual({ maxYo: null, rule: null });
  });
  it("대본의 '~요' 줄 비율", () => {
    expect(yoRatio("이거 좋아요\n진짜 미쳤다\n써봐\n편해요")).toBe(0.5);
  });
});
