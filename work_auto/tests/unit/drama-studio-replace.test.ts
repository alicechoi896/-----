import { describe, expect, it, vi } from "vitest";

/** v0.9.89: 스토리보드 교체 — 화면의 오래된 목록으로 저장해도 새로 올린 사진이 지워지지 않는다 */
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u4" }));
vi.mock("@/lib/server/providers/registry", () => ({ getAIProvider: async () => ({ id: "mock" }), getVideoAIProvider: async () => null }));
const { dramaStudioService: svc } = await import("@/lib/server/drama-studio/service");

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer;
async function upload(id: string, name: string, target: Record<string, unknown>) {
  const up = await svc.uploadUrl(id, { kind: "image", fileName: name, size: 10 });
  await svc.uploadMemory(up.key, png);
  return svc.register(id, { key: up.key, kind: "image", fileName: name, target });
}

describe("스토리보드 사진 교체", () => {
  it("교체한 사진이 승인되고, 예전 목록으로 저장해도 남는다 · [빼기] 표시한 것만 빠진다", async () => {
    const { project } = await svc.create({ title: "교체", startStep: "storyboard" });
    let p = (await upload(project.id, "scene_01.png", { type: "frame" })).project;
    const sceneId = p.scenario.scenes[0].id;
    const stale = p.storyboard; // 화면이 들고 있던 목록 (교체 전)
    p = (await upload(project.id, "new.png", { type: "frame", sceneId })).project;
    expect(p.storyboard[sceneId]).toHaveLength(2);
    expect(p.storyboard[sceneId][1].approved).toBe(true);
    expect(p.storyboard[sceneId][0].approved).toBe(false);
    // 화면이 교체 전 목록(예전 사진 승인)으로 자동 저장해도 → 새 사진은 남고, 승인은 새 사진
    p = (await svc.patch(project.id, { section: "storyboard", value: stale })).project;
    expect(p.storyboard[sceneId]).toHaveLength(2);
    expect(p.storyboard[sceneId].filter((i) => i.approved).map((i) => i.fileName)).toEqual(["new.png"]);
    // [목록에서 빼기]
    const oldId = p.storyboard[sceneId][0].id;
    p = (await svc.patch(project.id, { section: "storyboard", value: { [sceneId]: p.storyboard[sceneId].map((i) => (i.id === oldId ? { ...i, removed: true } : i)) } })).project;
    expect(p.storyboard[sceneId].map((i) => i.fileName)).toEqual(["new.png"]);
  });
});

describe("재검토 알림 닫기", () => {
  it("[확인했어요] → 승인했던 단계는 승인으로, 아니면 작업 중으로 (작업은 막지 않음)", async () => {
    const { project } = await svc.create({ title: "알림", startStep: "video" });
    const id = project.id;
    const p0 = (await svc.get(id)).project;
    expect(p0.steps.video.status).toBe("empty");
    // 앞 단계가 바뀐 상태를 만든다
    await svc.patch(id, { section: "timeline", value: [] });
    const { loadProject, saveProject } = await import("@/lib/server/drama-studio/store");
    const x = await loadProject("u4", id);
    x.steps.video = { status: "review", version: 0, approvedAt: null };
    x.steps.storyboard = { status: "review", version: 2, approvedAt: "a" };
    await saveProject("u4", x, "t");
    let p = (await svc.generate(id, { action: "ack-review", step: "video" })).project;
    expect(p.steps.video.status).toBe("draft");
    p = (await svc.generate(id, { action: "ack-review", step: "storyboard" })).project;
    expect(p.steps.storyboard.status).toBe("approved");
  });
});

describe("영상 교체 (v0.9.90)", () => {
  it("같은 장면에 새 영상을 올리면 타임라인 자리가 새 영상으로 바뀌고, 예전 영상은 남는다", async () => {
    const { spawnSync } = await import("node:child_process");
    const ff = (await import("ffmpeg-static")).default as unknown as string;
    const mp4 = (color: string) => spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=320x568:d=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "-"], { maxBuffer: 1 << 24 }).stdout;
    const { project } = await svc.create({ title: "영상 교체", startStep: "storyboard" });
    const id = project.id;
    let p = (await upload(id, "scene_01.png", { type: "frame" })).project;
    const sceneId = p.scenario.scenes[0].id;
    const put = async (name: string, color: string) => {
      const up = await svc.uploadUrl(id, { kind: "video", fileName: name, size: 10 });
      const buf = mp4(color);
      await svc.uploadMemory(up.key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      return (await svc.register(id, { key: up.key, kind: "video", fileName: name, target: { type: "clip", sceneIds: [sceneId] } })).project;
    };
    p = await put("a.mp4", "red");
    const first = p.clips[0];
    p = (await svc.patch(id, { section: "timeline", value: [{ id: "tl_1", clipId: first.id, trimStart: 0.2, trimEnd: 0, audio: true }] })).project;
    p = await put("b.mp4", "blue");
    expect(p.clips).toHaveLength(2);
    const second = p.clips[1];
    expect(p.timeline).toHaveLength(1);
    expect(p.timeline[0].clipId).toBe(second.id);
    expect(p.clips.find((c) => c.id === second.id)!.approved).toBe(true);
    expect(p.clips.some((c) => c.id === first.id)).toBe(true);
  }, 60_000);
});

describe("최종 영상 자막·로고 (v0.9.92)", () => {
  it("장면 대사 자막 + 직접 쓴 자막 + 왼쪽 위 로고를 넣어 병합한다", async () => {
    const { spawnSync } = await import("node:child_process");
    const ff = (await import("ffmpeg-static")).default as unknown as string;
    const { createCanvas } = await import("@napi-rs/canvas");
    const mp4 = (color: string) => spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=360x640:d=2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "-"], { maxBuffer: 1 << 24 }).stdout;
    const { project } = await svc.create({ title: "자막 로고", startStep: "storyboard" });
    const id = project.id;
    let p = (await upload(id, "scene_01.png", { type: "frame" })).project;
    p = (await upload(id, "scene_02.png", { type: "frame" })).project;
    const [s1, s2] = p.scenario.scenes;
    p = (await svc.patch(id, { section: "scenario", value: { ...p.scenario, scenes: [{ ...s1, dialogue: "서윤: 이게 왜 지금 와?\n도현: 나도 몰라" }, s2] } })).project;
    const put = async (sceneId: string, color: string) => {
      const up = await svc.uploadUrl(id, { kind: "video", fileName: `${color}.mp4`, size: 10 });
      const buf = mp4(color);
      await svc.uploadMemory(up.key, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      return (await svc.register(id, { key: up.key, kind: "video", fileName: `${color}.mp4`, target: { type: "clip", sceneIds: [sceneId] } })).project;
    };
    await put(s1.id, "gray");
    p = await put(s2.id, "navy");
    // 로고
    const c = createCanvas(200, 80);
    const g = c.getContext("2d");
    g.fillStyle = "#ff0066";
    g.fillRect(0, 0, 200, 80);
    const logoBuf = c.toBuffer("image/png");
    const up = await svc.uploadUrl(id, { kind: "image", fileName: "logo.png", size: logoBuf.length });
    await svc.uploadMemory(up.key, logoBuf.buffer.slice(logoBuf.byteOffset, logoBuf.byteOffset + logoBuf.byteLength) as ArrayBuffer);
    p = (await svc.register(id, { key: up.key, kind: "image", fileName: "logo.png", target: { type: "logo" } })).project;
    expect(p.renderSettings.logoKey).toBe(up.key);
    p = (await svc.patch(id, { section: "timeline", value: p.clips.map((cl, i) => ({ id: `tl_${i}`, clipId: cl.id, trimStart: 0, trimEnd: 0, audio: true, subtitle: i === 1 ? "직접 쓴 자막입니다" : null })) })).project;
    p = (await svc.patch(id, { section: "renderSettings", value: { ...p.renderSettings, subtitles: true, subtitleSize: "m" } })).project;
    expect(p.renderSettings.subtitles).toBe(true);
    await svc.approve(id, { step: "storyboard" });
    const { run } = await svc.startRender(id);
    await run();
    const done = await svc.get(id);
    const r = done.project.renders.at(-1)!;
    expect(r.status).toBe("success");
    expect(r.totalSec).toBeGreaterThan(3.5);
    // 확인용 프레임 (0.5초: 1번 자막·로고)
    const { videoStorage } = await import("@/lib/server/video/storage");
    const out = await videoStorage.download(r.key!);
    const fs = await import("node:fs");
    const tmp = `${process.env.TEMP ?? "/tmp"}/ds_sub_check.mp4`;
    fs.writeFileSync(tmp, out!);
    if (process.env.FRAME_OUT) spawnSync(ff, ["-y", "-ss", "0.5", "-i", tmp, "-frames:v", "1", process.env.FRAME_OUT]);
  }, 120_000);
});
