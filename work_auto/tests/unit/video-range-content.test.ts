import { describe, expect, it, vi } from "vitest";

/** v0.9.194 영상 구간을 정해도 내용을 보고 고른다: 제품이 안 보이는 브이로그 장면(앞 5초)은 쓰지 않고 제품 장면에서 */
vi.mock("@/lib/server/providers/registry", () => {
  const ai = {
    id: "mock",
    supportsVision: true,
    generateText: async (req: { task: string }) => {
      if (req.task === "video-scene-match") return { text: '{"m":[]}' };
      if (req.task === "video-cut-review") return { text: JSON.stringify({ cuts: [1, 2, 3].map((i) => ({ i, centered: true, foreignText: false, chinese: false, sharp: true, match: 2, reason: "" })) }) };
      // 프레임 12장: 앞쪽(0~5초)은 디저트·옷걸이 (제품 없음), 뒤쪽은 태블릿에 펜으로 필기
      return {
        text: JSON.stringify({
          frames: Array.from({ length: 12 }, (_, i) => {
            const t = 0.2 + i * (10 / 12);
            const has = t >= 5;
            return { i: i + 1, boxes: [], score: has ? 7 : 8, desc: has ? "태블릿에 펜으로 필기하는 손" : "디저트 접시와 꽃", product: has ? [0.25, 0.3, 0.5, 0.4] : null, cn: false };
          }),
        }),
      };
    },
  };
  return { getAIProvider: async () => ai, getVisionProvider: async () => ai, getTTSProvider: async () => null };
});
const { renderVideo } = await import("@/lib/server/video/render");

const job = {
  id: "vj_range1", userId: "u", contentId: null, channelId: "youtube" as const, sourceMode: "xhs" as const, status: "queued" as const,
  plan: { contentId: null, channelId: "youtube" as const, selectedTitle: "갤럭시탭", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
    scenes: ["필기 기능이", "정말 좋아요"].map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
    sourceEdits: { v1: { range: { from: 0.5 } } },
    ending: false, bgm: null, voice: "onyx", narrationOn: false, meme: false },
  qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
};
const videos = [{ id: "v1", userId: "u", url: "https://www.xiaohongshu.com/explore/v1", platform: "xiaohongshu" as const, title: "v1", channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }];

describe("구간을 정한 영상도 내용으로 고르기 (v0.9.194)", () => {
  it("제품이 없는 앞 구간 대신 제품이 보이는 구간, 장면 설명을 컷에 남김", async () => {
    const out = await renderVideo(job, videos, { stage: async () => undefined });
    for (const s of out.scenes) {
      expect(s.sourceStart ?? 0).toBeGreaterThanOrEqual(4.5);
      expect(s.sceneDesc ?? "").toContain("필기");
    }
  }, 180_000);
});
