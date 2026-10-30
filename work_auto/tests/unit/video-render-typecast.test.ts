import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

/**
 * v0.9.77: 타입캐스트는 대본 전체를 한 번만 부르고(시간표 있는 음성) 글자 시각으로 줄마다 잘라 쓴다 — 실제 FFmpeg 로.
 */
const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
const { TypecastTTSProvider } = await import("@/lib/server/providers/tts/typecast");
vi.mock("@/lib/server/providers/registry", async () => {
  const { TypecastTTSProvider: P } = await import("@/lib/server/providers/tts/typecast");
  return { getAIProvider: async () => ({ id: "mock", supportsVision: false }), getTTSProvider: async () => new P("KEY") };
});
const { renderVideo } = await import("@/lib/server/video/render");

// 소리 1초 · 쉼 0.4초 · 소리 1초 · 쉼 0.4초 · 소리 0.6초 (= 3줄)
const tone = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=3.4", "-af", "volume='if(between(t,1,1.4)+between(t,2.4,2.8),0,1)':eval=frame", "-f", "mp3", "-"], { maxBuffer: 1 << 24 }).stdout;
const lines = ["하나 둘", "셋 넷", "다섯"];
const chars = [
  ...[..."하나둘"].map((c, i) => ({ text: c, start: i / 3, end: (i + 1) / 3 })),
  ...[..."셋넷"].map((c, i) => ({ text: c, start: 1.4 + i / 2, end: 1.4 + (i + 1) / 2 })),
  ...[..."다섯"].map((c, i) => ({ text: c, start: 2.8 + i * 0.3, end: 2.8 + (i + 1) * 0.3 })),
];

describe("타입캐스트 한 번에 만들고 자르기 (v0.9.77)", () => {
  it("호출 1번 · 컷 3개 모두 음성 · 컷 길이 비율이 소리 길이를 따른다", async () => {
    expect(TypecastTTSProvider).toBeTruthy();
    const real = globalThis.fetch;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith("https://api.typecast.ai/")) {
        calls.push(String(url));
        return Response.json({ audio: tone.toString("base64"), audio_format: "mp3", characters: chars, audio_duration: 3.4 });
      }
      return real(url, init);
    });
    const job = {
      id: "vj_tc", userId: "u", contentId: null, channelId: "youtube" as const, sourceMode: "xhs" as const, status: "queued" as const,
      plan: { contentId: null, channelId: "youtube" as const, selectedTitle: "t", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
        scenes: lines.map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
        ending: false, bgm: null, voice: "tc_60e5426de8b95f1d3000d7b5", ttsEngine: "typecast" as const, voiceSpeed: 1, targetSec: 0, meme: false },
      qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
    };
    const videos = [{ id: "v1", userId: "u", url: "https://www.xiaohongshu.com/explore/v1", platform: "xiaohongshu" as const, title: "v1", channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }];
    const out = await renderVideo(job, videos, { stage: async () => undefined });
    vi.unstubAllGlobals();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/v1/text-to-speech/with-timestamps");
    expect(out.qa.voice).toBe("tts");
    expect(out.qa.issues.some((x) => x.includes("타입캐스트"))).toBe(false);
    const d = out.scenes.map((s) => s.duration ?? 0);
    // 무음을 없앤 뒤 소리 길이 1 : 1 : 0.6 (+ 컷 사이 여유) 근처
    expect(d[0]).toBeGreaterThan(0.85);
    expect(d[0]).toBeLessThan(1.2);
    expect(d[1]).toBeGreaterThan(0.85);
    expect(d[1]).toBeLessThan(1.2);
    // 마지막 컷 = 소리 0.6초 + 끝 여유 0.6초
    expect(d[2]).toBeGreaterThan(1);
    expect(d[2]).toBeLessThan(1.35);
  }, 180_000);
});
