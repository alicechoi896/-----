import { describe, expect, it, vi } from "vitest";

/** v0.9.79: 원본 글자 검사 결과를 저장해 다시 쓴다 — 같은 원본으로 두 번 만들면 두 번째는 AI 이미지 읽기 0회 */
const calls: string[] = [];
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({
    id: "mock",
    supportsVision: true,
    generateText: async (req: { task: string }) => {
      calls.push(req.task);
      if (req.task === "video-scene-match") return { text: '{"m":[]}' };
      return { text: JSON.stringify({ frames: Array.from({ length: 12 }, (_, i) => ({ i: i + 1, boxes: [], score: 6, desc: "제품을 손에 든 장면" })) }) };
    },
  }),
  getTTSProvider: async () => null,
}));
const { renderVideo } = await import("@/lib/server/video/render");

const job = (id: string) => ({
  id, userId: "u", contentId: null, channelId: "youtube" as const, sourceMode: "xhs" as const, status: "queued" as const,
  plan: { contentId: null, channelId: "youtube" as const, selectedTitle: "t", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
    scenes: ["하나", "둘"].map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
    ending: false, bgm: null, voice: "onyx", narrationOn: false, meme: false },
  qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
});
const videos = [{ id: "v1", userId: "u", url: "https://www.xiaohongshu.com/explore/v1", platform: "xiaohongshu" as const, title: "v1", channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }];

describe("글자 검사 결과 다시 쓰기 (v0.9.79)", () => {
  it("두 번째 렌더는 글자 검사 AI 를 부르지 않는다", async () => {
    await renderVideo(job("vj_c1"), videos, { stage: async () => undefined });
    const first = calls.filter((t) => t === "video-text-scan").length;
    expect(first).toBe(1); // 12장을 한 번에
    await renderVideo(job("vj_c2"), videos, { stage: async () => undefined });
    expect(calls.filter((t) => t === "video-text-scan").length).toBe(first);
  }, 180_000);
});
