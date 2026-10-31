import { describe, expect, it, vi } from "vitest";

/** v0.9.86: 프로젝트 문서는 저장마다 새 버전 파일 → 읽을 때 가장 최신 (CDN 캐시로 예전 내용을 읽던 문제) */
vi.mock("@/lib/server/repositories", () => ({ getCurrentUserId: async () => "u2" }));
const { loadProject, saveProject } = await import("@/lib/server/drama-studio/store");
const { emptyProject } = await import("@/lib/drama-studio/steps");
const { videoStorage } = await import("@/lib/server/video/storage");

describe("드라마 스튜디오 저장", () => {
  it("저장할 때마다 새 버전, 읽으면 가장 최신 — 승인 상태가 되돌아가지 않는다", async () => {
    const p = emptyProject("dp_storetest1", "t", "2026-10-31T00:00:00.000Z");
    await saveProject("u2", p, "x");
    const a = await loadProject("u2", p.id);
    a.steps.ideas = { status: "approved", version: 1, approvedAt: "x" };
    await saveProject("u2", a, "y");
    const b = await loadProject("u2", p.id);
    expect(b.steps.ideas.status).toBe("approved");
    expect(b.rev).toBe(2);
  });
  it("버전 파일은 최근 15개만 남긴다", async () => {
    let p = emptyProject("dp_storetest2", "t", "x");
    for (let i = 0; i < 20; i++) {
      p.title = `t${i}`;
      p = await saveProject("u2", p, "x");
    }
    const files = await videoStorage.list("u2/drama/dp_storetest2/rev");
    expect(files).toHaveLength(15);
    expect((await loadProject("u2", "dp_storetest2")).title).toBe("t19");
  });
});
