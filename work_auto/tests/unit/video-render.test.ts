import { describe, expect, it, vi } from "vitest";

/**
 * 영상 자동 제작 엔진 (v0.9.51) — 실제 FFmpeg(ffmpeg-static)로 데모 원본(시험 영상)을 렌더해 본다.
 * AI 음성·이미지 읽기는 없음(데모) → 음성 없이 자막 시간으로, 원본 글자 검사는 '검사 안 됨'.
 */
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({ id: "mock", supportsVision: false }),
  getTTSProvider: async () => null,
}));

const { renderVideo } = await import("@/lib/server/video/render");
const { splitScript } = await import("@/lib/server/video/planner");
const { sfxSceneIndexes, arrowSceneIndexes } = await import("@/lib/video-production/config");
const { decideTreatment } = await import("@/lib/server/video/text-scan");

describe("영상 자동 제작", () => {
  it("대본 → 컷: 한 줄 = 한 컷, 긴 줄은 띄어쓰기에서", () => {
    const s = splitScript("폰 고를 때 뭐부터 봐야할까요?\n이 3가지만 확인하세요\n먼저 화면이에요. 아이폰17은 120Hz로 화면이 아주 부드럽고 스크롤이 편해요");
    expect(s[0]).toBe("폰 고를 때 뭐부터 봐야할까요?");
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.every((x) => x.length <= 18 || !x.includes(" "))).toBe(true);
  });

  it("효과음 약 2컷당 1회·연속 금지, 화살표 4번째 컷", () => {
    const sfx = sfxSceneIndexes(12, [3, 4, 7]);
    expect(sfx[0]).toBe(0);
    expect(sfx.length).toBeGreaterThanOrEqual(5);
    expect(sfx.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < sfx.length; i++) expect(sfx[i] - sfx[i - 1]).toBeGreaterThanOrEqual(2);
    expect(arrowSceneIndexes(12)).toContain(3);
  });

  it("원본 글자: 없음 → clean, 아래 자막 → crop, 가운데 작은 글자 → blur, 큰 글자 → 제외, 검사 못 함 → unchecked", () => {
    expect(decideTreatment([], true).kind).toBe("clean");
    expect(decideTreatment([{ x: 0.1, y: 0.85, w: 0.8, h: 0.06 }], true).kind).toBe("crop");
    expect(decideTreatment([{ x: 0.4, y: 0.45, w: 0.2, h: 0.05 }], true).kind).toBe("blur");
    expect(decideTreatment([{ x: 0.05, y: 0.3, w: 0.9, h: 0.4 }], true).kind).toBe("rejected");
    expect(decideTreatment([], false).kind).toBe("unchecked");
    expect(decideTreatment([{ x: 0.1, y: 0.02, w: 0.8, h: 0.08 }], true).kind).toBe("clean"); // 상단 띠가 덮음
  });

  it("렌더: 9:16 mp4 · 컷 길이 합 = 영상 길이 · 상단 제목·자막·엔딩", async () => {
    const stages: string[] = [];
    const job = {
      id: "vj_test",
      userId: "u",
      contentId: null,
      channelId: "youtube" as const,
      sourceMode: "xhs" as const,
      status: "queued" as const,
      plan: {
        contentId: null,
        channelId: "youtube" as const,
        selectedTitle: "아이폰 17 사기 전에 꼭 볼 3가지",
        topLine1: "Apple 아이폰 17",
        topLine2: "폰 고를 때 뭐부터 봐야할까요?",
        script: "",
        sourceMode: "xhs" as const,
        sourceVideoIds: ["v1", "v2"],
        scenes: ["폰 고를 때 뭐부터 봐야할까요?", "이 3가지만 확인하세요", "먼저 화면이에요", "아이폰17은 120Hz로", "할인링크 걸어두었어요"].map((narration, index) => ({
          index,
          narration,
          sfx: null,
          arrow: index === 3,
          sourceVideoId: index % 2 ? "v2" : "v1",
        })),
        ending: true,
        bgm: null,
        voice: "onyx",
        meme: false,
      },
      qa: { issues: [] },
      progress: 0,
      outputPath: null,
      error: null,
      claimedBy: null,
      claimedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const videos = ["v1", "v2"].map((id) => ({ id, userId: "u", url: `https://www.xiaohongshu.com/explore/${id}`, platform: "xiaohongshu" as const, title: id, channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }));
    const out = await renderVideo(job, videos, { stage: async (s) => void stages.push(s) });
    if (process.env.VIDEO_OUT) (await import("node:fs")).writeFileSync(process.env.VIDEO_OUT, out.file);
    expect(out.file.length).toBeGreaterThan(10_000);
    expect(out.file.subarray(4, 8).toString()).toBe("ftyp"); // mp4
    expect(stages).toContain("rendering");
    expect(Math.abs((out.qa.durationSec ?? 0) - (out.qa.expectedDurationSec ?? 0))).toBeLessThan(0.5);
    expect(out.scenes.every((s) => s.textTreatment === "unchecked")).toBe(true);
    expect(out.qa.voice).toBe("none");
    // 같은 원본의 같은 구간을 반복하지 않는다
    const v1 = out.scenes.filter((s) => s.sourceVideoId === "v1").map((s) => s.sourceStart);
    expect(new Set(v1).size).toBe(v1.length);
  }, 180_000);

  it("음성·자막 끄기: 둘 다 없음도 만든다 (음성 off 는 검수 사유가 아님)", async () => {
    const videos = ["v1"].map((id) => ({ id, userId: "u", url: "https://www.xiaohongshu.com/explore/" + id, platform: "xiaohongshu" as const, title: id, channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }));
    const job = {
      id: "vj_off", userId: "u", contentId: null, channelId: "naver-clip" as const, sourceMode: "xhs" as const, status: "queued" as const,
      plan: { contentId: null, channelId: "naver-clip" as const, selectedTitle: "t", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
        scenes: ["하나", "둘 셋", "넷"].map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
        ending: true, bgm: null, voice: "onyx", narrationOn: false, captions: false, meme: false },
      qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
    };
    const out = await renderVideo(job, videos, { stage: async () => undefined });
    expect(out.qa.voice).toBe("off");
    expect(out.qa.issues.some((x) => x.includes("AI 음성"))).toBe(false);
    expect(out.file.subarray(4, 8).toString()).toBe("ftyp");
  }, 120_000);
});
