import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mem = new Map<string, Buffer>();
vi.mock("@/lib/server/video/storage", () => ({
  videoStorage: {
    put: async (k: string, b: Buffer) => void mem.set(k, b),
    download: async (k: string) => mem.get(k) ?? null,
  },
}));

const { buildVideoInput, estimateVideoCredits, videoModel } = await import("@/lib/drama-studio/models");
const { emptyShot, shotCode, shotCostSummary, shotVideoPrompt, dialogueFit } = await import("@/lib/drama-studio/shots");
const { buildTimeline, clipSubtitle, emptyProject, emptyScene, swapIntoTimeline } = await import("@/lib/drama-studio/steps");
const { renderDrama } = await import("@/lib/server/drama-studio/render");
const { runFfmpeg, mediaDuration } = await import("@/lib/server/video/ffmpeg");
const { videoAssets } = await import("@/lib/server/video/assets");
type Clip = import("@/lib/drama-studio/types").DramaClip;

const char = (id: string, name: string) => ({ id, name, role: "주인공", age: "30대", gender: "남성", appearance: "", appearanceEn: "tall man with a black topknot", outfit: "", personality: "", desire: "", weakness: "", secret: "", conflict: "", relations: [], arc: "", speech: "", voice: "deep calm male voice" });

function project() {
  const p = emptyProject("dp_shots01", "t", "2026-11-01T00:00:00.000Z");
  p.characters = [char("c_kasim1", "카심")];
  const s1 = emptyScene({ title: "등장", location: "방" });
  const s2 = emptyScene({ title: "소원 선언", location: "방", dialogue: "카심: 세 가지 소원을 말해라" });
  p.scenario.scenes = [s1, s2];
  p.shots = [
    emptyShot(s2.id, 0, { id: "sh_a00001", kind: "wide", approved: true }),
    emptyShot(s2.id, 1, { id: "sh_b00001", kind: "dialogue", dialogue: "카심: 세 가지 소원을 말해라", characterIds: ["c_kasim1"], approved: true }),
    emptyShot(s2.id, 2, { id: "sh_c00001", kind: "reaction", continueFromPrev: true, approved: true }),
  ];
  return { p, s1, s2 };
}
const clip = (id: string, sceneId: string, shotId: string | null, approved = true): Clip => ({ id, sceneIds: [sceneId], key: `k/${id}.mp4`, source: "ai", modelId: "seedance-2-mini", mode: "first_frame", prompt: "", durationSec: 5, createdAt: "", approved, taskId: null, shotId });

describe("샷 (v0.9.104)", () => {
  it("Seedance 2.0 Mini: 4~15초 · 480p/720p · 해상도별 단가 (720p 8.2/초)", () => {
    const m = videoModel("seedance-2-mini")!;
    expect(m.model).toBe("bytedance/seedance-2-mini");
    expect(estimateVideoCredits({ modelId: m.id, mode: "first_frame", durationSec: 5, resolution: "720p", aspect: "9:16", audio: true })).toBe(41);
    expect(estimateVideoCredits({ modelId: m.id, mode: "first_frame", durationSec: 5, resolution: "480p", aspect: "9:16", audio: true })).toBe(19);
    // 시작 프레임과 참고 이미지를 섞지 않는다
    const input = buildVideoInput({ modelId: m.id, mode: "first_frame", durationSec: 5, resolution: "720p", aspect: "9:16", audio: true }, { prompt: "x", firstUrl: "https://a/1.png", referenceUrls: ["https://a/2.png"] });
    expect(input.first_frame_url).toBe("https://a/1.png");
    expect(input.reference_image_urls).toBeUndefined();
  });
  it("샷 번호 Scene02-ShotA/B/C · 비용 요약 (모델별 샷 수·초)", () => {
    const { p } = project();
    expect(p.shots!.map((s) => shotCode(p, s))).toEqual(["Scene02-ShotA", "Scene02-ShotB", "Scene02-ShotC"]);
    const c = shotCostSummary([...p.shots!, { ...p.shots![0], modelId: "seedance-2-fast", durationSec: 6 }]);
    expect(c.shots).toBe(4);
    expect(c.seconds).toBe(21);
    expect(c.lines.find((l) => l.modelId === "seedance-2-mini")).toMatchObject({ shots: 3, seconds: 15, credits: 123 });
  });
  it("영상 프롬프트: 핵심 행동 하나 · 대사 + 목소리 · 이어 만들기 문구", () => {
    const { p, s2 } = project();
    const o = { modelId: "seedance-2-mini", mode: "first_frame" as const, durationSec: 5, resolution: "720p", aspect: "9:16" as const, audio: true };
    const t = shotVideoPrompt(p, s2, p.shots![1], o, [], false);
    expect(t).toContain('카심 [voice: deep calm male voice] says in Korean: "세 가지 소원을 말해라"');
    expect(t).toContain("do not add other actions");
    expect(shotVideoPrompt(p, s2, p.shots![2], o, [], true)).toContain("last frame of the previous shot");
    expect(dialogueFit({ dialogue: "카심: 세 가지 소원을 말해라", durationSec: 5 }).ok).toBe(true);
    expect(dialogueFit({ dialogue: "카심: " + "가".repeat(60), durationSec: 5 }).ok).toBe(false);
  });
  it("타임라인: 샷으로 만든 장면은 샷 순서대로, 같은 샷끼리만 교체", () => {
    const { p, s1, s2 } = project();
    p.clips = [clip("cl_scene1", s1.id, null), clip("cl_c", s2.id, "sh_c00001"), clip("cl_a", s2.id, "sh_a00001"), clip("cl_b", s2.id, "sh_b00001"), clip("cl_scene2", s2.id, null)];
    p.timeline = buildTimeline(p);
    expect(p.timeline.map((t) => t.clipId)).toEqual(["cl_scene1", "cl_a", "cl_b", "cl_c"]);
    // 새 B 버전은 B 자리만 바꾼다
    const nb = clip("cl_b2", s2.id, "sh_b00001", false);
    p.clips.push(nb);
    swapIntoTimeline(p, nb);
    expect(p.timeline.map((t) => t.clipId)).toEqual(["cl_scene1", "cl_a", "cl_b2", "cl_c"]);
    expect(clipSubtitle(p, nb)).toBe("세 가지 소원을 말해라");
  });
});

describe("샷 병합: 올린 음성 + 효과음 (FFmpeg)", () => {
  it("샷 클립 3개를 이어 붙이고, 음성 파일·효과음을 섞는다", async () => {
    const { p, s2 } = project();
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shot_t_"));
    for (const [i, id] of ["cl_a", "cl_b", "cl_c"].entries()) {
      const f = path.join(dir, `${id}.mp4`);
      await runFfmpeg(["-y", "-f", "lavfi", "-i", `testsrc2=size=360x640:rate=24:duration=2`, "-f", "lavfi", "-i", `sine=frequency=${300 + i * 100}:duration=2`, "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", f], 60_000);
      mem.set(`k/${id}.mp4`, await fs.readFile(f));
    }
    const v = path.join(dir, "v.mp3");
    await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=800:duration=1.5", "-c:a", "libmp3lame", v], 60_000);
    mem.set("k/voice.mp3", await fs.readFile(v));
    p.shots![1] = { ...p.shots![1], voiceSource: "upload", voiceKey: "k/voice.mp3" };
    p.clips = [clip("cl_a", s2.id, "sh_a00001"), clip("cl_b", s2.id, "sh_b00001"), clip("cl_c", s2.id, "sh_c00001")].map((c) => ({ ...c, durationSec: 2 }));
    p.timeline = buildTimeline(p);
    const sfx = videoAssets.sfx()[0];
    if (sfx) p.timeline[0].sfx = path.basename(sfx);
    const out = await renderDrama("u", p, { id: "r1", version: 1, status: "running", totalSec: null, key: null, error: null, createdAt: "", updatedAt: "" });
    const f = path.join(dir, "out.mp4");
    await fs.writeFile(f, mem.get(out.key)!);
    expect(Math.abs((await mediaDuration(f)) - 6)).toBeLessThan(0.5);
    await fs.rm(dir, { recursive: true, force: true });
  }, 180_000);
});

describe("v0.9.106 비교 모델: Veo 3.1 Lite · Grok Imagine 1.5 · PixVerse V6 Max", async () => {
  const { buildVideoInput, fitDuration, hasConflictingInputs, kieModelOf, validateVideo, videoModel } = await import("@/lib/drama-studio/models");
  const o = (modelId: string, mode: "first_frame" | "first_last" | "text" | "reference", durationSec = 6, resolution = "720p") => ({ modelId, mode, durationSec, resolution, aspect: "9:16" as const, audio: true });
  it("Veo: veo-3-1 + veo3_lite, 시작 프레임 = FIRST_AND_LAST_FRAMES_2_VIDEO, 4·6·8초만", () => {
    const i = buildVideoInput(o("veo-3-1-lite", "first_frame"), { prompt: "p", firstUrl: "https://a/1.png" });
    expect(kieModelOf("veo-3-1-lite", "first_frame")).toBe("veo-3-1");
    expect(i).toMatchObject({ model: "veo3_lite", generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: ["https://a/1.png"], duration: 6 });
    expect(validateVideo(o("veo-3-1-lite", "first_frame", 5), { first: true, references: 0, scenes: 1 }).join()).toContain("4·6·8초");
    expect(fitDuration(videoModel("veo-3-1-lite")!, 5)).toBe(4);
    expect(fitDuration(videoModel("veo-3-1-lite")!, 7)).toBe(6);
  });
  it("Grok 1.5: first_frame_url / 참고는 image_urls 1장", () => {
    expect(buildVideoInput(o("grok-imagine-1-5", "first_frame"), { prompt: "p", firstUrl: "https://a/1.png" })).toMatchObject({ first_frame_url: "https://a/1.png", duration: 6, resolution: "720p" });
    const r = buildVideoInput(o("grok-imagine-1-5", "reference"), { prompt: "p", referenceUrls: ["https://a/1.png", "https://a/2.png"] });
    expect(r.image_urls).toEqual(["https://a/1.png"]);
    expect(hasConflictingInputs(r)).toBe(false);
  });
  it("PixVerse V6 Max: 방식마다 모델이 다르고, 이미지→영상은 비율을 보내지 않는다", () => {
    expect(kieModelOf("pixverse-v6-max", "first_frame")).toBe("pixverse-v6-max/image-to-video");
    expect(kieModelOf("pixverse-v6-max", "text")).toBe("pixverse-v6-max/text-to-video");
    const i = buildVideoInput(o("pixverse-v6-max", "first_frame"), { prompt: "p", firstUrl: "https://a/1.png" });
    expect(i).toMatchObject({ image_urls: ["https://a/1.png"], quality: "720p", generate_audio_switch: true });
    expect(i.aspect_ratio).toBeUndefined();
    expect(buildVideoInput(o("pixverse-v6-max", "text"), { prompt: "p" }).aspect_ratio).toBe("9:16");
  });
});

describe("v0.9.108 모델 최대 길이 표시", async () => {
  const { VIDEO_MODELS, lengthLabel, modelOptionLabel, videoModel } = await import("@/lib/drama-studio/models");
  it("7개 비교 모델이 모두 있고 최대 길이를 붙인다", () => {
    for (const id of ["veo-3-1-lite", "grok-imagine-1-5", "minimax-h3", "pixverse-v6-max", "seedance-2-mini", "seedance-2-fast", "kling-3"]) expect(VIDEO_MODELS.some((m) => m.id === id)).toBe(true);
    expect(modelOptionLabel(videoModel("veo-3-1-lite")!)).toBe("Veo 3.1 Lite · 최대 8초 · 가격 확인 안 됨");
    expect(modelOptionLabel(videoModel("seedance-2-mini")!)).toBe("Seedance 2.0 Mini · 최대 15초 · 5초 약 41크레딧($0.21)");
    expect(lengthLabel(videoModel("veo-3-1-lite")!)).toBe("4·6·8초");
    expect(modelOptionLabel(videoModel("seedance-2-5")!)).toContain("Seedance 2.5 · 최대 30초 · 5초 약 85크레딧");
    expect(lengthLabel(videoModel("kling-3")!)).toBe("3~15초");
  });
});
