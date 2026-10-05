import { describe, expect, it } from "vitest";
import { GENERATOR_CONFIGS } from "@/lib/generators/configs";
import { SKELETON_CHECKS, scriptMetaKey, supportsPrecise } from "@/lib/generators/quality";
import { getPromptTemplate } from "@/lib/server/ai/prompts/templates";

describe("생성 품질: 대본 뼈대·2단계 생성 대상 (v0.9.31 → v0.9.40)", () => {
  it("영상·클립 프롬프트에 대본 뼈대 규칙 (3~5초 Hook·오픈 루프·끝에 답·한 줄 = 정보 하나)", () => {
    for (const id of ["youtube.product-video", "youtube.info-video", "naver-clip.product-content", "naver-clip.info-content"]) {
      const t = getPromptTemplate(id);
      expect(t.task).toContain("대본 뼈대");
      expect(t.task).toContain("오픈 루프");
      expect(t.task).toContain("답은 끝부분");
      expect(t.version).toBe("1.13.0");
    }
    // 블로그에는 넣지 않는다
    expect(getPromptTemplate("naver-blog.info-writing").task).not.toContain("대본 뼈대");
  });

  it("2단계 생성은 대본·제목·Hook 이 있는 영상·클립만 (블로그는 기존 흐름)", () => {
    const precise = Object.values(GENERATOR_CONFIGS)
      .filter((c) => supportsPrecise(c.outputs))
      .map((c) => c.featureId)
      .sort();
    expect(precise).toEqual(["clip-info-content", "clip-product-content", "yt-info-video", "yt-product-video"]);
  });

  it("뼈대 체크 3가지 (이전 정밀 생성 이력 표시용), 정밀 생성 프롬프트는 없어졌다", () => {
    expect(SKELETON_CHECKS.map((c) => c.key)).toEqual(["hook", "openLoop", "answer"]);
    expect(() => getPromptTemplate("content.precise-angles")).toThrow();
  });

  it("대본 ↔ 메타 키는 공백·기호를 무시", () => {
    expect(scriptMetaKey("이거 모르면 손해예요!\n진짜요")).toBe(scriptMetaKey("이거 모르면  손해예요 진짜요"));
  });
});
