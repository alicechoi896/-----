import { describe, expect, it } from "vitest";
import { DEFAULT_DRAMA_MODELS, DRAMA_MODELS } from "@/lib/drama/config";
import { buildDramaPrompt } from "@/lib/drama/prompt";

describe("모델 비교 시험 — 7개 모델 (v0.9.115)", () => {
  const cast = [{ id: "c1", name: "서윤", description: "short bob", imageUrl: "https://x/1.jpg", closeUrl: null, uploadedAt: null }, { id: "c2", name: "도현", description: "grey hoodie", imageUrl: "https://x/2.jpg", closeUrl: null, uploadedAt: null }];
  const scene = { id: "s1", description: "카페에서 마주 앉는다", dialogue: "서윤: 오랜만이야" };
  it("요청한 7개 모델이 모두 있고, 처음엔 예전 3개만 골라 둔다", () => {
    expect(DRAMA_MODELS.map((m) => m.label)).toEqual(expect.arrayContaining(["Veo 3.1 Lite", "Grok Imagine Video 1.5", "MiniMax H3", "PixVerse V6 Max", "Seedance 2.0 Mini", "Seedance 2.0 Fast", "Kling 3.0"]));
    expect(DEFAULT_DRAMA_MODELS).toEqual(["minimax-h3", "seedance-mini", "kling3"]);
  });
  it("참고 사진을 받지 않는 모델은 첫 인물 사진을 시작 화면으로", () => {
    const t = buildDramaPrompt(scene, cast as never, "veo-lite");
    expect(t).toContain("Start from the provided first frame: 서윤");
    expect(t).not.toContain("reference image");
    expect(t).toContain('서윤: "오랜만이야"');
    expect(buildDramaPrompt(scene, cast as never, "seedance-fast")).toContain("reference image 2");
  });
});
