import { describe, expect, it } from "vitest";
import { wrapLine, wrapScript } from "@/lib/script-format";

describe("wrapLine (v0.9.174 대본 한 줄 8~10자, 낱말 중간에서 안 끊기)", () => {
  it("띄어쓰기에서만 나눈다 — '지금'을 '지/금'으로 가르지 않는다", () => {
    const out = wrapLine("갤럭시워치 8 지금 사야 좋습니다.");
    expect(out.join(" ")).toBe("갤럭시워치 8 지금 사야 좋습니다.");
    for (const l of out) expect(l.length).toBeLessThanOrEqual(10);
    expect(out.some((l) => l.endsWith(" 지") || l === "지")).toBe(false);
  });
  it("짧은 줄은 그대로, 긴 낱말은 한 줄로 둔다", () => {
    expect(wrapLine("이거 진짜요")).toEqual(["이거 진짜요"]);
    expect(wrapLine("초경량무선청소기프로맥스 추천")).toEqual(["초경량무선청소기프로맥스", "추천"]);
  });
  it("줄 길이를 고르게 (끝에 짧은 조각만 남기지 않음)", () => {
    const out = wrapLine("손목 부담이 정말 적어서 좋아요");
    for (const l of out) expect(l.length).toBeLessThanOrEqual(10);
    expect(Math.min(...out.map((l) => l.length))).toBeGreaterThanOrEqual(4);
  });
  it("대본 전체: 빈 줄은 그대로", () => {
    expect(wrapScript("짧은 줄\n\n손목 부담이 정말 적어서 좋아요").split("\n")[1]).toBe("");
  });
});
