import { describe, expect, it } from "vitest";
import { FEED_FORMATS, REEL_FORMATS, feedFormatOf, reelFormatOf } from "@/lib/fashion/formats";
import { emptyFashionProject, lookPrompt, modelPrompt } from "@/lib/fashion/prompts";

describe("AI 패션 콘텐츠 유형 (v0.9.181)", () => {
  it("유형 목록과 기본값 (없으면 룩북 · 카드 = 예전 그대로)", () => {
    expect(REEL_FORMATS.map((f) => f.value)).toEqual(["lookbook", "daily", "weekday", "faceless", "character", "unboxing", "walking", "review"]);
    expect(FEED_FORMATS.map((f) => f.value)).toEqual(["card", "cardLabel", "flatTitle", "flatlay", "palette"]);
    expect(reelFormatOf(undefined).value).toBe("lookbook");
    expect(feedFormatOf("x").value).toBe("card");
  });
  it("룩 이미지 프롬프트가 유형의 카메라·자세를 따른다", () => {
    const p = emptyFashionProject("fp_t", "t", new Date().toISOString());
    p.looks = [{ id: "lk1", name: "LOOK 1", itemIds: [], caption: "", pose: "", images: [] }, { id: "lk2", name: "LOOK 2", itemIds: [], caption: "", pose: "", images: [] }];
    const base = lookPrompt(p, p.looks[0], [], true);
    expect(base).toContain("eye-level camera");
    p.settings.format = "faceless";
    expect(lookPrompt(p, p.looks[0], [], true)).toContain("face is NOT visible");
    p.settings.format = "daily";
    expect(lookPrompt(p, p.looks[1], [], true)).toContain("back to the camera");
    p.settings.format = "character";
    expect(lookPrompt(p, p.looks[0], [], true)).toContain("doll-like character");
    expect(modelPrompt(p.model, { character: true })).toContain("ball-jointed-doll-like");
    expect(modelPrompt(p.model)).toContain("photorealistic lookbook");
  });
});
