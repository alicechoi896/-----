import { describe, expect, it, vi } from "vitest";

/**
 * AI 드라마 스튜디오 (v0.9.81) 전체 흐름 — Mock AI·Mock Kie·메모리 저장소 + 실제 FFmpeg 병합.
 * 유료 호출 없음. Kie 작업은 만든 횟수를 세고, 일부러 실패시키는 작업도 만든다.
 */
const created: { model: string; input: Record<string, unknown> }[] = [];
const failIds = new Set<string>();
let n = 0;
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u1", getActorId: async () => "u1" }));
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({ id: "mock" }),
  getVideoAIProvider: async () => ({
    id: "mock-kie-test",
    async createTask(model: string, input: Record<string, unknown>) {
      created.push({ model, input });
      return { taskId: `t${++n}`, model };
    },
    async status(taskId: string) {
      return failIds.has(taskId) ? { state: "fail", resultUrl: null, credits: null, error: "Kie 가 만들지 못했습니다 (테스트)." } : { state: "success", resultUrl: "https://example.com/r.mp4", credits: 7, error: null };
    },
  }),
}));
const { dramaStudioService: svc } = await import("@/lib/server/drama-studio/service");
const { SHEET_KINDS } = await import("@/lib/drama-studio/prompts");

describe("드라마 스튜디오 전체 흐름", () => {
  it("아이디어 → … → 스토리보드 25컷 → 영상(개별·묶음) → 타임라인 → 최종 MP4", async () => {
    let { project: p } = await svc.create({ title: "테스트", settings: { idea: "1년 만에 온 문자", genre: "미스터리", aspect: "9:16" } });
    const id = p.id;

    // 1) 아이디어 20개 → 승인 전에는 다음 단계 불가
    p = (await svc.generate(id, { action: "ideas" })).project;
    expect(p.ideas).toHaveLength(20);
    await expect(svc.approve(id, { step: "select" })).rejects.toThrow("승인");
    await expect(svc.approve(id, { step: "ideas" })).rejects.toThrow("선택");
    p = (await svc.patch(id, { section: "selection", value: { ...p.selection, ideaId: p.ideas[3].id, idea: p.ideas[3] } })).project;
    p = (await svc.approve(id, { step: "ideas" })).project;
    expect(p.currentStep).toBe("select");

    // 2~4) 선택 → 로그라인 → 등장인물
    p = (await svc.approve(id, { step: "select" })).project;
    p = (await svc.generate(id, { action: "story" })).project;
    expect(p.story.loglines).toHaveLength(3);
    p = (await svc.approve(id, { step: "story" })).project;
    p = (await svc.generate(id, { action: "characters" })).project;
    expect(p.characters.length).toBeGreaterThanOrEqual(3);
    expect(p.characters.every((c) => /^c_/.test(c.id))).toBe(true);
    p = (await svc.approve(id, { step: "characters" })).project;

    // 5) 캐릭터 시트: 확인 없이는 실행하지 않음 → 인물마다 정면 → 상태 확인 → 기준 고정
    await expect(svc.images(id, { jobs: [], modelId: "nano-banana-edit", clientRequestId: "req-sheet-0001" })).rejects.toThrow("확인");
    const sheetJobs = p.characters.map((c) => ({ target: { type: "sheet", charId: c.id, sheetKind: "front" } }));
    p = (await svc.images(id, { jobs: sheetJobs, modelId: "nano-banana-edit", clientRequestId: "req-sheet-0001", confirmed: true })).project;
    // 기준 이미지가 아직 없으니 글만 모델로 바뀐다
    expect(created.at(-1)!.model).toBe("google/nano-banana");
    // 같은 요청 번호로 다시 눌러도 새로 만들지 않는다
    const before = created.length;
    await svc.images(id, { jobs: sheetJobs, modelId: "nano-banana-edit", clientRequestId: "req-sheet-0001", confirmed: true });
    expect(created.length).toBe(before);
    p = (await svc.sync(id)).project;
    for (const c of p.characters) expect(p.sheets[c.id]).toHaveLength(1);
    await expect(svc.approve(id, { step: "sheets" })).rejects.toThrow("기준 이미지");
    p = (await svc.patch(id, { section: "sheets", value: Object.fromEntries(Object.entries(p.sheets).map(([k, l]) => [k, l.map((i) => ({ ...i, approved: true }))])) })).project;
    // 기준 이미지가 생기면 다른 종류는 참고 이미지 모델로
    p = (await svc.images(id, { jobs: [{ target: { type: "sheet", charId: p.characters[0].id, sheetKind: "full" } }], modelId: "nano-banana-edit", clientRequestId: "req-sheet-0002", confirmed: true })).project;
    expect(created.at(-1)!.model).toBe("google/nano-banana-edit");
    expect((created.at(-1)!.input.image_urls as string[]).length).toBe(1);
    expect(SHEET_KINDS.length).toBeGreaterThanOrEqual(5);
    p = (await svc.approve(id, { step: "sheets" })).project;

    // 6) 시나리오 25장면
    p = (await svc.generate(id, { action: "scenario", sceneCount: 25 })).project;
    expect(p.scenario.scenes).toHaveLength(25);
    expect(p.scenario.scenes[0].characterIds.length).toBeGreaterThan(0);
    p = (await svc.approve(id, { step: "scenario" })).project;

    // 7) 스토리보드 25컷 (장면마다 작업 1개, 인물 기준 이미지 참고)
    p = (await svc.generate(id, { action: "en-prompts" })).project;
    expect(p.scenario.scenes.every((s) => s.en)).toBe(true);
    const frameJobs = p.scenario.scenes.map((s) => ({ target: { type: "frame", sceneId: s.id } }));
    const c0 = created.length;
    p = (await svc.images(id, { jobs: frameJobs, modelId: "nano-banana-edit", clientRequestId: "req-frames-01", confirmed: true })).project;
    expect(created.length - c0).toBe(25);
    expect(created.slice(c0).every((x) => Array.isArray(x.input.image_urls) && (x.input.image_urls as string[]).length > 0)).toBe(true);
    p = (await svc.sync(id)).project;
    expect(p.scenario.scenes.every((s) => (p.storyboard[s.id] ?? []).length === 1)).toBe(true);
    // 시나리오 장면 ↔ 스토리보드 ↔ 인물 기준 이미지가 이어져 있다
    const t = p.tasks.find((x) => x.target.type === "frame")!;
    expect((t.request as { references: string[] }).references[0]).toMatch(/\/drama\/dp_.+\/img\//);
    await expect(svc.approve(id, { step: "storyboard" })).rejects.toThrow("승인한 이미지가 없는 장면");
    p = (await svc.patch(id, { section: "storyboard", value: Object.fromEntries(Object.entries(p.storyboard).map(([k, l]) => [k, l.map((i) => ({ ...i, approved: true }))])) })).project;
    p = (await svc.approve(id, { step: "storyboard" })).project;
    expect(p.currentStep).toBe("video");

    // 8-A) 장면 1 개별 5초 (첫 프레임만, 참고 이미지와 섞지 않음)
    const s = p.scenario.scenes;
    const fast = { modelId: "seedance-2-fast", mode: "first_frame", durationSec: 5, resolution: "720p", aspect: "9:16", audio: true };
    await expect(svc.videos(id, { jobs: [{ sceneIds: [s[0].id], options: { ...fast, durationSec: 20 } }], clientRequestId: "req-video-bad", confirmed: true })).rejects.toThrow("4~15초");
    p = (await svc.videos(id, { jobs: [{ sceneIds: [s[0].id], options: fast }], clientRequestId: "req-video-01", confirmed: true })).project;
    const single = created.at(-1)!;
    expect(single.model).toBe("bytedance/seedance-2-fast");
    expect(single.input).toMatchObject({ duration: 5, aspect_ratio: "9:16" });
    expect(typeof single.input.first_frame_url).toBe("string");
    expect("reference_image_urls" in single.input).toBe(false);

    // 8-B) 장면 2~5 묶음 (Kling 3.0 멀티 샷 = 순서대로) + 장면 6~9 개별 (2개는 일부러 실패)
    p = (await svc.videos(id, { jobs: [{ sceneIds: [s[1].id, s[2].id, s[3].id, s[4].id], options: { modelId: "kling-3", mode: "multi_shot", durationSec: 12, resolution: "std", aspect: "9:16", audio: true, shotSecs: [3, 3, 3, 3] } }], clientRequestId: "req-video-02", confirmed: true })).project;
    expect(created.at(-1)!.input).toMatchObject({ multi_shots: true, duration: "12" });
    expect((created.at(-1)!.input.multi_prompt as unknown[]).length).toBe(4);
    failIds.add(`t${n + 2}`).add(`t${n + 3}`);
    p = (await svc.videos(id, { jobs: [5, 6, 7, 8].map((i) => ({ sceneIds: [s[i].id], options: fast })), clientRequestId: "req-video-03", confirmed: true })).project;
    p = (await svc.sync(id)).project;
    const vids = p.tasks.filter((x) => x.kind === "video");
    expect(vids.filter((x) => x.status === "success")).toHaveLength(4);
    expect(vids.filter((x) => x.status === "fail")).toHaveLength(2);
    expect(p.clips).toHaveLength(4);
    // 실패한 것만 다시 (성공한 클립은 그대로)
    failIds.clear();
    p = (await svc.videos(id, { retryTaskIds: vids.filter((x) => x.status === "fail").map((x) => x.id), clientRequestId: "req-video-retry", confirmed: true })).project;
    p = (await svc.sync(id)).project;
    expect(p.clips).toHaveLength(6);

    // 타임라인: 묶음(2~5) 먼저, 그다음 개별 — 순서를 바꿔 5개 병합
    const clips = p.clips;
    p = (await svc.patch(id, { section: "clips", value: clips.map((c) => ({ ...c, approved: true })) })).project;
    const order = [clips[1], clips[0], clips[2], clips[3], clips[4]];
    p = (await svc.patch(id, { section: "timeline", value: order.map((c, i) => ({ id: `tl_${i}`, clipId: c.id, trimStart: 0, trimEnd: i === 0 ? 0.5 : 0, audio: i !== 2 })) })).project;
    expect(p.timeline.map((x) => x.clipId)).toEqual(order.map((c) => c.id));
    const { result, run } = await svc.startRender(id);
    expect(result.project.renders.at(-1)!.status).toBe("running");
    await run();
    const done = await svc.get(id);
    const r = done.project.renders.at(-1)!;
    expect(r.status).toBe("success");
    // 데모 클립 3초 × 5 − 앞 클립 0.5초
    expect(r.totalSec).toBeGreaterThan(13.5);
    expect(r.totalSec).toBeLessThan(15);
    expect(done.urls[r.key!]).toBeTruthy();

    // 다시 열어도 그대로 (저장 테스트)
    const again = await svc.get(id);
    expect(again.project.scenario.scenes).toHaveLength(25);
    expect(again.project.clips).toHaveLength(6);
    expect((await svc.list()).projects[0].id).toBe(id);
    // 앞 단계를 고치면 뒤 단계는 재검토 (지우지 않음)
    const edited = (await svc.patch(id, { section: "story", value: { ...again.project.story, theme: "바뀐 주제" } })).project;
    expect(edited.steps.story.status).toBe("draft");
    expect(edited.steps.scenario.status).toBe("review");
    expect(edited.scenario.scenes).toHaveLength(25);
    // 내보내기
    expect(await svc.exportText(id)).toContain("## 시나리오");
  }, 300_000);

  it("스토리보드 이미지부터 시작: 올린 이미지마다 장면을 만든다", async () => {
    const { project } = await svc.create({ title: "업로드 시작", startStep: "storyboard" });
    expect(project.steps.scenario.status).toBe("skipped");
    const up = await svc.uploadUrl(project.id, { kind: "image", fileName: "scene_01.png", size: 1000 });
    expect(up.key).toContain(`/drama/${project.id}/up/`);
    await svc.uploadMemory(up.key, new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer);
    const r = await svc.register(project.id, { key: up.key, kind: "image", fileName: "scene_01.png", target: { type: "frame" } });
    expect(r.project.scenario.scenes).toHaveLength(1);
    expect(r.project.storyboard[r.project.scenario.scenes[0].id][0].approved).toBe(true);
    // 다른 프로젝트 파일은 잇지 못한다
    await expect(svc.register(project.id, { key: "u1/drama/dp_other000/up/x.png", target: { type: "frame" } })).rejects.toThrow("이 프로젝트");
    await expect(svc.uploadUrl(project.id, { kind: "image", fileName: "a.exe", size: 10 })).rejects.toThrow("파일만");
  });
});
