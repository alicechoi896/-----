import { describe, expect, it } from "vitest";
import { similarExamples } from "@/lib/script-format";

describe("비슷한 참고 대본 고르기 (v0.9.189)", () => {
  const ex = [
    { title: "LG그램16 사면 후회합니다", views: 1000, text: "LG그램 16 고민 중인 분들! 노트북" },
    { title: "갤럭시 핏3 무시하지 마세요", views: 18000, text: "갤럭시 핏3 무시하지 마세요 워치" },
    { title: "갤럭시워치 울트라 구매 전 필수 체크", views: 28000, text: "갤럭시 워치 울트라 고민 중인 분들 스마트워치" },
    { title: "아이패드 미니", views: 78000, text: "아이패드 미니 7세대" },
  ];
  it("제품 낱말이 맞는 대본을 조회수보다 먼저", () => {
    const r = similarExamples(ex, false, "갤럭시워치 울트라 스마트워치");
    expect(r[0].title).toContain("갤럭시워치 울트라");
    expect(r.length).toBe(4);
  });
  it("맞는 게 없으면 조회수 높은 순", () => {
    expect(similarExamples(ex, false, "냉장고")[0].title).toBe("아이패드 미니");
  });
  it("글자 수를 줄인다", () => {
    const long = [{ title: "a", views: 1, text: "가".repeat(2000) }];
    expect(similarExamples(long, false, "").at(0)!.text.length).toBeLessThanOrEqual(601);
  });
});
