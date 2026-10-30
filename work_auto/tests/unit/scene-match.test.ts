import { describe, expect, it, vi } from "vitest";

/** v0.9.78: 대본 줄 ↔ 뜻이 맞는 장면 (AI 글 1회) → 구간 고르기에 반영 */
const generateText = vi.fn(async () => ({ text: '{"m":[{"line":1,"scene":3},{"line":2,"scene":0}]}' }));
vi.mock("@/lib/server/providers/registry", () => ({ getAIProvider: async () => ({ id: "mock", supportsVision: true, generateText }) }));
const { matchScenes } = await import("@/lib/server/video/scene-match");
const { pickSegment } = await import("@/lib/server/video/text-scan");

const scan = (descs: string[]) => ({ checked: true, interval: 2, samples: descs.map((desc, i) => ({ t: i * 2 + 0.2, boxes: [], score: 6, desc })) });

describe("뜻이 맞는 장면 매핑 (v0.9.78)", () => {
  it("한 번 호출 · 장면 번호 → 영상·초, 0 은 없음", async () => {
    const r = await matchScenes(["충전이 정말 빨라요", "디자인도 예뻐요"], [
      { id: "a", scan: scan(["제품 박스", "손에 들고 웃음"]) },
      { id: "b", scan: scan(["충전 케이블 꽂는 손", "책상 위 제품"]) },
    ]);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(r.wants.get(0)).toEqual({ id: "b", t: 0.2 });
    expect(r.wants.has(1)).toBe(false);
  });
  it("장면 설명이 없으면 부르지 않는다", async () => {
    generateText.mockClear();
    const r = await matchScenes(["a"], [{ id: "a", scan: { checked: false, interval: 1, samples: [{ t: 0, boxes: [] }] } }]);
    expect(generateText).not.toHaveBeenCalled();
    expect(r.aiCalls).toBe(0);
  });
  it("구간 고르기: 뜻이 맞는 장면을 품은 구간을 고른다 (사람이 고른 클립이 더 우선)", () => {
    const sources = [
      { id: "a", duration: 10, scan: scan(["제품 박스", "손에 들고 웃음", "책상", "포장", "끝"]), assigned: true },
      { id: "b", duration: 10, scan: scan(["책상", "제품", "충전 케이블 꽂는 손", "책상", "끝"]), assigned: false },
    ];
    const best = pickSegment({ narration: "빨라요", dur: 1.5, sources, used: new Map(), want: { id: "b", t: 4.2 } });
    expect(best?.id).toBe("b");
    expect(best!.start).toBeLessThanOrEqual(4.2 + 0.3);
    expect(best!.start + 1.5).toBeGreaterThanOrEqual(4.2 - 0.3);
    const pinned = pickSegment({ narration: "빨라요", dur: 1.5, sources: [{ ...sources[0], pinned: true }, sources[1]], used: new Map(), want: null });
    expect(pinned?.id).toBe("a");
  });
});
