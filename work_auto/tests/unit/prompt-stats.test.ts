import { describe, expect, it } from "vitest";
import { promptVersionStats } from "@/lib/domain/prompt-stats";

const c = (id: string, version: string, extra: { edit?: number; precise?: boolean } = {}) => ({
  id,
  featureId: "yt-product-video",
  promptId: "youtube.product-video",
  promptVersion: version,
  createdAt: `2026-10-0${id.length}T00:00:00Z`,
  context: { userEdits: extra.edit != null ? { script: { ratio: extra.edit } } : undefined, quality: extra.precise ? { mode: "precise" } : null },
});

describe("프롬프트 버전별 성과표", () => {
  it("버전·생성 방식별로 👍 비율·수정·업로드율·평균 조회수", () => {
    const rows = promptVersionStats({
      contents: [c("a", "1.11.0", { edit: 0.6 }), c("bb", "1.11.0"), c("ccc", "1.12.0"), c("dddd", "1.12.0", { edit: 0.1 }), c("e", "1.12.0", { precise: true })],
      feedback: [
        { contentId: "a", rating: "up", createdAt: "1" },
        { contentId: "a", rating: "down", createdAt: "2" }, // 마지막 평가만
        { contentId: "ccc", rating: "up", createdAt: "1" },
        { contentId: "dddd", rating: "up", createdAt: "1" },
      ],
      publications: [{ contentId: "ccc" }, { contentId: null }],
      performance: [
        { contentId: "ccc", views: 1000 },
        { contentId: "ccc", views: 5000 }, // 결과마다 가장 큰 값
        { contentId: "a", views: 100 },
      ],
    });
    expect(rows.map((r) => `${r.version}:${r.mode}`)).toEqual(["1.12.0:fast", "1.12.0:precise", "1.11.0:fast"]);
    const v12 = rows[0];
    expect(v12).toMatchObject({ count: 2, rated: 2, upRate: 1, editedRate: 0.5, avgEditRatio: 0.1, uploadRate: 0.5, viewed: 1, avgViews: 5000 });
    const v11 = rows[2];
    expect(v11).toMatchObject({ count: 2, rated: 1, upRate: 0, editedRate: 0.5, avgEditRatio: 0.6, uploadRate: 0, avgViews: 100 });
    expect(rows[1]).toMatchObject({ mode: "precise", count: 1, upRate: null, avgViews: null });
  });
});

describe("학습: 실제 조회수 상위 3 vs 하위 3 비교 (2단계)", async () => {
  const { performanceContrast } = await import("@/lib/server/services/learning");
  const contents = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}` }));
  it("조회수가 있는 콘텐츠가 6개 이상일 때만, 콘텐츠별 최고 조회수 기준", () => {
    const perf = contents.map((c, i) => ({ contentId: c.id, views: (i + 1) * 100 }));
    perf.push({ contentId: "c0", views: 99_999 }); // c0 은 나중에 크게 늘었다
    const k = performanceContrast(contents, perf)!;
    expect(k.top.map((x) => x.c.id)).toEqual(["c0", "c6", "c5"]);
    expect(k.bottom.map((x) => x.c.id)).toEqual(["c1", "c2", "c3"]);
    expect(performanceContrast(contents.slice(0, 5), perf)).toBeNull();
  });
});
