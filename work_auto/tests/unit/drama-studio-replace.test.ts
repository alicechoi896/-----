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
