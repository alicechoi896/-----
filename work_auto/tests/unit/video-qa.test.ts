import { describe, expect, it, vi } from "vitest";

/** v0.9.185 편집 프리셋 자동 검수: 걸린 컷은 다른 장면으로 바꿔 다시 검수한다 */
const calls: string[] = [];
let reviews = 0;
vi.mock("@/lib/server/providers/registry", () => {
  const ai = {
    id: "mock",
    supportsVision: true,
    generateText: async (req: { task: string }) => {
      calls.push(req.task);
      if (req.task === "video-scene-match") return { text: '{"m":[]}' };
      if (req.task === "video-cut-review") {
        reviews++;
        // 첫 검수: 1번 컷은 원본 글자가 보임 → 바꿔야 함. 두 번째부터는 통과
        return { text: JSON.stringify({ cuts: [1, 2].map((i) => ({ i, centered: true, foreignText: reviews === 1 && i === 1, chinese: false, sharp: true, match: 2, reason: "" })) }) };
      }
      return { text: JSON.stringify({ frames: Array.from({ length: 12 }, (_, i) => ({ i: i + 1, boxes: [], score: 6, desc: "제품을 손에 든 장면", product: [0.3, 0.3, 0.4, 0.4], cn: false })) }) };
    },
  };
  return { getAIProvider: async () => ai, getVisionProvider: async () => ai, getTTSProvider: async () => null };
});
const { renderVideo } = await import("@/lib/server/video/render");

const job = {
  id: "vj_qa1", userId: "u", contentId: null, channelId: "youtube" as const, sourceMode: "xhs" as const, status: "queued" as const,
  plan: { contentId: null, channelId: "youtube" as const, selectedTitle: "t", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
    scenes: ["하나", "둘"].map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
    ending: false, bgm: null, voice: "onyx", narrationOn: false, meme: false },
  qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
};
const videos = [{ id: "v1", userId: "u", url: "https://www.xiaohongshu.com/explore/v1", platform: "xiaohongshu" as const, title: "v1", channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }];

describe("편집 프리셋 자동 검수 (v0.9.185)", () => {
  it("걸린 컷은 다른 구간으로 바꾸고, 다시 검수해 통과하면 멈춘다", async () => {
    const before: number[] = [];
    const out = await renderVideo(job, videos, { stage: async () => undefined });
    void before;
    expect(reviews).toBe(2); // 첫 검수 → 1번 컷 바꿈 → 바꾼 컷만 다시 검수 → 통과
    expect(out.qa.issues.some((x) => x.includes("자동 검수 2번") && x.includes("1컷을 다른 장면으로") && x.includes("모두 통과"))).toBe(true);
  }, 180_000);
});
