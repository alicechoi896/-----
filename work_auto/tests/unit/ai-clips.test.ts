import { describe, expect, it } from "vitest";

const { parseRecord } = await import("@/lib/server/providers/video-ai/kie");
const { defaultClips, placeClips, sanitizeClips } = await import("@/lib/server/video/ai-clips");
const { estimateAiClipUsd } = await import("@/lib/video-production/config");

describe("AI 컷 (v0.9.60, Kie AI)", () => {
  it("상태 읽기: resultJson 문자열 · 실패 이유 · 크레딧", () => {
    expect(parseRecord({ state: "success", resultJson: '{"resultUrls":["https://x.kie/v.mp4"]}', creditsConsumed: 20 })).toEqual({ state: "success", resultUrl: "https://x.kie/v.mp4", credits: 20, error: null });
    expect(parseRecord({ state: "queuing" }).state).toBe("waiting");
    expect(parseRecord({ state: "generating" }).state).toBe("generating");
    const f = parseRecord({ state: "fail", failMsg: "content policy", creditsConsumed: 0 });
    expect(f.state).toBe("fail");
    expect(f.error).toContain("content policy");
    // 끝났다는데 주소가 없으면 실패로
    expect(parseRecord({ state: "success", resultJson: "{}" }).state).toBe("fail");
  });
  it("기본 컷: 제품 사진이 있으면 제품·장면을 번갈아, 없으면 장면만, 최대 10개", () => {
    const withImg = defaultClips(3, { productName: "청소기", images: ["https://a/1.jpg", "https://a/2.jpg"], narrations: ["a", "b", "c", "d"] });
    expect(withImg.map((c) => c.mode)).toEqual(["product", "text", "product"]);
    expect(withImg[0].imageUrl).toBe("https://a/1.jpg");
    expect(withImg[2].imageUrl).toBe("https://a/2.jpg");
    expect(defaultClips(2, { productName: null, images: [], narrations: [] }).every((c) => c.mode === "text")).toBe(true);
    expect(defaultClips(99, { productName: null, images: [], narrations: [] })).toHaveLength(10);
  });
  it("배치: 섞기는 고르게 n 컷만(고정), AI만은 모든 컷을 돌아가며", () => {
    const scenes = Array.from({ length: 8 }, (_, i) => ({ index: i, narration: `n${i}`, sfx: null, arrow: false, sourceVideoId: "v1" }));
    const plan = { scenes } as never;
    const clips = defaultClips(2, { productName: null, images: [], narrations: [] });
    const mixed = placeClips(plan, clips, false);
    expect(mixed.filter((s) => s.sourceVideoId?.startsWith("ai:"))).toHaveLength(2);
    expect(mixed.filter((s) => s.sourceVideoId === "v1")).toHaveLength(6);
    const only = placeClips(plan, clips, true);
    expect(only.map((s) => s.sourceVideoId)).toEqual(["ai:ai1", "ai:ai2", "ai:ai1", "ai:ai2", "ai:ai1", "ai:ai2", "ai:ai1", "ai:ai2"]);
  });
  it("화면이 보낸 AI 컷은 믿지 않는다: 이 제품 사진만, 잘못된 id·작업번호 제거", () => {
    const out = sanitizeClips(
      [
        { id: "ai1", mode: "product", prompt: "x", imageUrl: "https://evil/1.jpg", taskId: "t_123456", state: "success" },
        { id: "ai1", mode: "text", prompt: "중복" },
        { id: "../x", mode: "text", prompt: "y" },
        { id: "ai2", mode: "text", prompt: "z", taskId: "bad id!", state: "success" },
      ],
      new Set(["https://ok/1.jpg"]),
    );
    expect(out.map((c) => c.id)).toEqual(["ai1", "ai2"]);
    expect(out[0].imageUrl).toBeNull();
    expect(out[0].state).toBe("success");
    expect(out[1]).toMatchObject({ taskId: null, state: "draft" });
  });
  it("예상 비용: 제품 컷 $0.10, 가격 모르는 모델은 따로 센다", () => {
    expect(estimateAiClipUsd(["product", "product", "text"])).toEqual({ usd: 0.2, unknown: 1 });
  });
});
