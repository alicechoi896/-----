import { describe, expect, it, vi } from "vitest";

/** v0.9.87 얼굴 일관성: 기준 이미지가 없는 인물은 정면을 먼저 → 끝나면 그 정면을 참고로 나머지 (Mock Kie, 유료 호출 없음) */
const created: { model: string; input: Record<string, unknown> }[] = [];
const done = new Set<string>();
let n = 0;
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u3" }));
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({ id: "mock" }),
  getVideoAIProvider: async () => ({
    id: "mock-kie-chain",
    async createTask(model: string, input: Record<string, unknown>) {
      created.push({ model, input });
      return { taskId: `c${++n}`, model };
    },
    async status(taskId: string) {
      return done.has(taskId) ? { state: "success", resultUrl: "https://example.com/r.png", credits: 4, error: null } : { state: "generating", resultUrl: null, credits: null, error: null };
    },
  }),
}));
const { dramaStudioService: svc } = await import("@/lib/server/drama-studio/service");

describe("캐릭터 시트 얼굴 일관성", () => {
  it("정면·측면·전신·표정을 한 번에 → 정면 1장만 먼저, 끝나면 그 정면을 참고로 3장", async () => {
    let { project: p } = await svc.create({ title: "얼굴", startStep: "sheets" });
    p = (await svc.patch(p.id, { section: "characters", value: [{ id: "c_face0001", name: "서윤", role: "주인공", age: "20대", gender: "여성", appearance: "단발", appearanceEn: "Korean woman, short black bob", outfit: "코트", personality: "", desire: "", weakness: "", secret: "", conflict: "", relations: [], arc: "", speech: "" }] })).project;
    const jobs = ["front", "side", "full", "expression"].map((k) => ({ target: { type: "sheet", charId: "c_face0001", sheetKind: k } }));
    p = (await svc.images(p.id, { jobs, modelId: "nano-banana-edit", clientRequestId: "req-face-0001", confirmed: true })).project;
    // 정면 1장만 보냄 (글만 모델), 나머지 3장은 기다림
    expect(created).toHaveLength(1);
    expect(created[0].model).toBe("google/nano-banana");
    expect(p.tasks.filter((t) => t.status === "queued" && t.dependsOn)).toHaveLength(3);
    // 정면이 아직 만드는 중이면 그대로
    p = (await svc.sync(p.id)).project;
    expect(created).toHaveLength(1);
    // 정면 완료 → 나머지 3장을 정면 이미지를 참고로 보낸다
    done.add("c1");
    p = (await svc.sync(p.id)).project;
    expect(created).toHaveLength(4);
    for (const c of created.slice(1)) {
      expect(c.model).toBe("google/nano-banana-edit");
      expect((c.input.image_urls as string[]).length).toBe(1);
      expect(String(c.input.prompt)).toContain("Draw the SAME person");
    }
    const front = p.tasks.find((t) => !t.dependsOn)!;
    expect(p.tasks.filter((t) => t.dependsOn).every((t) => (t.request as { references: string[] }).references[0] === front.storedKey)).toBe(true);
    done.add("c2").add("c3").add("c4");
    p = (await svc.sync(p.id)).project;
    expect(p.sheets.c_face0001).toHaveLength(4);
    expect(created).toHaveLength(4); // 확인한 4장 그대로 (추가 비용 없음)
  });
});
