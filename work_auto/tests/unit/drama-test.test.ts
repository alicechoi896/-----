import { describe, expect, it } from "vitest";
const { buildDramaPrompt, dialogueLines, klingElementName } = await import("@/lib/drama/prompt");
const { dramaCostUsd } = await import("@/lib/drama/config");

const cast = [
  { id: "c1", name: "민준", description: "20대 남성, 베이지 셔츠", imageUrl: "https://tempfile.redpandaai.co/a.jpg", closeUrl: null, uploadedAt: null },
  { id: "c2", name: "지아", description: "20대 여성, 흰 셔츠", imageUrl: "https://tempfile.redpandaai.co/b.jpg", closeUrl: null, uploadedAt: null },
];
const scene = { id: "s1", description: "카페 창가", dialogue: "민준: 오래 기다렸지?\n지아：아니, 나도 방금 왔어.\n그냥 혼잣말" };

describe("AI 드라마 시험 (v0.9.62)", () => {
  it("대사: '이름: 대사' 를 나누고, 이름 없는 줄도 받는다", () => {
    expect(dialogueLines(scene.dialogue)).toEqual([
      { speaker: "민준", line: "오래 기다렸지?" },
      { speaker: "지아", line: "아니, 나도 방금 왔어." },
      { speaker: "", line: "그냥 혼잣말" },
    ]);
  });
  it("MiniMax·Seedance: 참고 사진 순서로 인물을 가리키고 한국어 대사를 그대로", () => {
    const p = buildDramaPrompt(scene, cast, "minimax-h3");
    expect(p).toContain("민준 = the person in reference image 1");
    expect(p).toContain("지아 = the person in reference image 2");
    expect(p).toContain('민준: "오래 기다렸지?"');
    expect(p).toContain("9:16");
  });
  it("Kling: 인물 요소를 @char1 로 부른다", () => {
    expect(klingElementName(cast[1])).toBe("char2");
    expect(buildDramaPrompt(scene, cast, "kling3")).toContain("지아 @char2");
  });
  it("비용: 3장면 × 3모델 (8초) = $4.34", () => {
    expect(dramaCostUsd(["minimax-h3", "seedance-mini", "kling3"], 3)).toBe(4.34);
  });
});
