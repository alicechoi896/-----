import { describe, expect, it } from "vitest";
import { HOOK_FORMULAS, hookScore, outlierOf } from "@/lib/instagram/hook-score";

describe("Hook 점수 (v0.9.196)", () => {
  it("26가지 공식", () => {
    expect(HOOK_FORMULAS).toHaveLength(26);
  });
  it("짧고 숫자·걸린 말·부르는 말이 있으면 높고, 인사·예고로 시작하면 낮다", () => {
    const good = hookScore("갤럭시탭 고민 중인 분들, 30만 원 손해 봐요");
    const bad = hookScore("안녕하세요 여러분 오늘은 제가 정말 좋은 태블릿을 소개해 드릴게요");
    expect(good.total).toBeGreaterThan(70);
    expect(bad.total).toBeLessThanOrEqual(30);
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
  it("숫자가 없으면 경고", () => {
    expect(hookScore("이거 진짜 좋아요").warnings).toContain("구체적인 숫자·이름이 없음");
  });
});

describe("팔로워 대비 (평소 대비 대신값)", () => {
  it("조회수가 팔로워의 3배 넘으면 터짐", () => {
    expect(outlierOf({ plays: 90_000, likes: null, comments: null, followers: 20_000 })).toMatchObject({ basis: "plays", tier: "hot" });
    expect(outlierOf({ plays: 5_000, likes: null, comments: null, followers: 20_000 })?.tier).toBe("normal");
  });
  it("조회수 없으면 참여율, 팔로워 없으면 null", () => {
    expect(outlierOf({ plays: null, likes: 2_000, comments: 100, followers: 20_000 })).toMatchObject({ basis: "engagement", tier: "hot" });
    expect(outlierOf({ plays: 100, likes: 1, comments: 1, followers: null })).toBeNull();
  });
});
