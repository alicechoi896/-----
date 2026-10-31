import { describe, expect, it, vi } from "vitest";

/** v0.9.93: 앞 장면에 이어 만들기 + 얼굴 검사 (Mock, 유료 호출 없음) */
const created: { model: string; input: Record<string, unknown> }[] = [];
const done = new Set<string>();
let n = 0;
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u5" }));
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({ id: "mock", supportsVision: true }),
  getVideoAIProvider: async () => ({
    id: "mock-kie-chain2",
    async createTask(model: string, input: Record<string, unknown>) {
      created.push({ model, input });
      return { taskId: `v${++n}`, model };
    },
    async status(taskId: string) {
      return done.has(taskId) ? { state: "success", resultUrl: "https://example.com/r.mp4", credits: 34, error: null } : { state: "generating", resultUrl: null, credits: null, error: null };
    },
  }),
}));
const { dramaStudioService: svc } = await import("@/lib/server/drama-studio/service");
const { defaultSceneCount } = await import("@/lib/drama-studio/steps");

const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer as ArrayBuffer;
async function frame(id: string, name: string) {
  const up = await svc.uploadUrl(id, { kind: "image", fileName: name, size: 10 });
  await svc.uploadMemory(up.key, png);
  return svc.register(id, { key: up.key, kind: "image", fileName: name, target: { type: "frame" } });
}

describe("앞 장면에 이어 만들기", () => {
  it("기본 장면 수 = 길이÷8초", () => {
    expect(defaultSceneCount(120)).toBe(15);
    expect(defaultSceneCount(60)).toBe(8);
    expect(defaultSceneCount(30)).toBe(6);
  });
  it("같은 장소가 이어지는 장면은 앞 클립 마지막 프레임에서 시작, 장소가 바뀌면 스토리보드에서", async () => {
    const { project } = await svc.create({ title: "이어 만들기", startStep: "storyboard" });
    const id = project.id;
    for (const k of [1, 2, 3]) await frame(id, `scene_0${k}.png`);
    let p = (await svc.get(id)).project;
    const [s1, s2, s3] = p.scenario.scenes;
    p = (await svc.patch(id, { section: "scenario", value: { ...p.scenario, scenes: [{ ...s1, location: "학교 창고" }, { ...s2, location: "학교 창고" }, { ...s3, location: "교실" }] } })).project;
    await svc.approve(id, { step: "storyboard" });
    const fast = { modelId: "seedance-2-fast", mode: "first_frame", durationSec: 8, resolution: "720p", aspect: "9:16", audio: true };
    p = (await svc.videos(id, { jobs: [s1, s2, s3].map((s) => ({ sceneIds: [s.id], options: fast })), clientRequestId: "req-chain-001", confirmed: true, chain: true })).project;
    // 장면 1·3 은 바로, 장면 2 는 1 을 기다림
    expect(created).toHaveLength(2);
    const t2 = p.tasks.find((t) => t.target.type === "clip" && t.target.sceneIds[0] === s2.id)!;
    expect(t2.status).toBe("queued");
    expect(t2.dependsOn).toBeTruthy();
    // 장면 1 완료 → 장면 2 를 그 마지막 프레임으로
    done.add("v1");
    p = (await svc.sync(id)).project;
    expect(created).toHaveLength(3);
    expect(typeof created[2].input.first_frame_url).toBe("string");
    const t2b = p.tasks.find((t) => t.id === t2.id)!;
    expect((t2b.request as { chainedFrom?: string }).chainedFrom).toMatch(/\/img\/last_.+\.png$/);
    expect(String(t2b.prompt)).toContain("One continuous shot");
  }, 60_000);
  it("얼굴 일관성 검사: 인물이 있는 스토리보드에 결과를 남긴다 (데모)", async () => {
    const { project } = await svc.create({ title: "얼굴 검사", startStep: "storyboard" });
    const id = project.id;
    await frame(id, "scene_01.png");
    let p = (await svc.get(id)).project;
    p = (await svc.patch(id, { section: "characters", value: [{ id: "c_face0009", name: "서윤", role: "주인공", age: "", gender: "", appearance: "", appearanceEn: "", outfit: "", personality: "", desire: "", weakness: "", secret: "", conflict: "", relations: [], arc: "", speech: "" }] })).project;
    p = (await svc.patch(id, { section: "scenario", value: { ...p.scenario, scenes: [{ ...p.scenario.scenes[0], characterIds: ["c_face0009"] }] } })).project;
    // 기준 이미지
    const up = await svc.uploadUrl(id, { kind: "image", fileName: "front.png", size: 10 });
    await svc.uploadMemory(up.key, png);
    p = (await svc.register(id, { key: up.key, kind: "image", fileName: "front.png", target: { type: "sheet", charId: "c_face0009", sheetKind: "front" } })).project;
    p = (await svc.patch(id, { section: "sheets", value: { c_face0009: p.sheets.c_face0009.map((i) => ({ ...i, approved: true })) } })).project;
    const r = (await svc.generate(id, { action: "face-check", target: "frames" })) as { project: typeof p; faceChecked?: number };
    expect(r.faceChecked).toBe(1);
    expect(r.project.storyboard[r.project.scenario.scenes[0].id][0].faceCheck?.ok).toBe(true);
  });
});
