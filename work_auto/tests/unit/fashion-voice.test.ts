import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

/** v0.9.193 AI 패션 릴스 내레이션: 말소리가 들어가고, 말이 길면 룩이 늘어나고, 말하기 속도가 적용된다 */
const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
// 2초짜리 소리 (TTS 대신)
const tone = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=2.6", "-f", "mp3", "-"], { maxBuffer: 1 << 24 }).stdout;
const said: string[] = [];
vi.mock("@/lib/server/providers/registry", () => ({
  getTTSProvider: async () => ({ synthesize: async (text: string) => (said.push(text), tone) }),
}));
const { renderReels } = await import("@/lib/server/fashion/render");
const { videoStorage } = await import("@/lib/server/video/storage");
const { emptyFashionProject } = await import("@/lib/fashion/prompts");
const { createCanvas } = await import("@napi-rs/canvas");

const probe = (buf: Buffer) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", "pipe:0", "-f", "null", "-"], { input: buf, maxBuffer: 1 << 26 });
  const err = r.stderr.toString();
  const m = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return { hasAudio: /Audio:/.test(err), dur: m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0 };
};

describe("AI 패션 릴스 내레이션 (v0.9.193)", () => {
  it("POV·룩·댓글 안내를 읽고, 말이 룩 길이보다 길면 늘리고, 속도 2배면 더 짧다", async () => {
    const p = emptyFashionProject("fs_voice", "시험", new Date().toISOString());
    const cv = createCanvas(720, 1280);
    cv.getContext("2d").fillRect(0, 0, 720, 1280);
    await videoStorage.put("u/fashion/fs_voice/look.png", cv.toBuffer("image/png"), "image/png");
    p.looks = [0, 1].map((i) => ({ id: `lk${i}`, name: `LOOK ${i + 1}`, itemIds: [], caption: `룩 문구 ${i + 1}`, pose: "", images: [{ id: `im${i}`, key: "u/fashion/fs_voice/look.png", prompt: "", modelId: "", source: "upload" as const, createdAt: "", approved: true }] }));
    p.settings = { ...p.settings, pov: "POV: 출근룩 고민 끝", cta: "댓글에 링크", secPerLook: 1.5, voice: { on: true, ttsEngine: "openai", voice: "", voiceSpeed: 1, captions: true } };
    const r1 = await renderReels("u", p, { id: "r1", kind: "reels", status: "running", keys: [], totalSec: null, error: null, createdAt: "", updatedAt: "" });
    expect(said[0]).toBe("출근룩 고민 끝. 룩 문구 1"); // 'POV:' 는 읽지 않음
    expect(said).toContain("댓글에 링크");
    const a = probe((await videoStorage.download(r1.key))!);
    expect(a.hasAudio).toBe(true);
    expect(r1.totalSec).toBeGreaterThan(1.5 * 2 + 2.5 + 1); // 말(2.6초)이 룩(1.5초)보다 길어 늘어남
    p.settings.voice!.voiceSpeed = 2;
    const r2 = await renderReels("u", p, { id: "r2", kind: "reels", status: "running", keys: [], totalSec: null, error: null, createdAt: "", updatedAt: "" });
    expect(r2.totalSec).toBeLessThan(r1.totalSec - 1); // 2배 → 짧아짐
  }, 240_000);
});
