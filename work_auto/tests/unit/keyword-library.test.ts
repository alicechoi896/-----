import { describe, expect, it } from "vitest";
const { normalizeKeyword, isUsefulKeyword, trendOf, isoWeek } = await import("@/lib/server/services/keyword-library");

describe("키워드 관리 (v0.9.56)", () => {
  it("같은 말 묶음: 띄어쓰기·대소문자·순서·프로/Pro·iPhone/아이폰", () => {
    const a = normalizeKeyword("아이폰18프로");
    expect(normalizeKeyword("아이폰 Pro18")).toBe(a);
    expect(normalizeKeyword("iPhone 18 Pro")).toBe(a);
    expect(normalizeKeyword("#아이폰18PRO")).toBe(a);
    expect(normalizeKeyword("아이폰듀오")).not.toBe(a);
    expect(normalizeKeyword("갤럭시 S26 울트라")).toBe(normalizeKeyword("galaxy s26 ultra"));
  });
  it("자동 수집에서 뺄 말", () => {
    expect(isUsefulKeyword("추천")).toBe(false);
    expect(isUsefulKeyword("shorts")).toBe(false);
    expect(isUsefulKeyword("2026")).toBe(false);
    expect(isUsefulKeyword("아이폰듀오")).toBe(true);
  });
  it("상승·하락: 최근 2주 vs 그 전 2주, 2주 안에 처음 본 것은 '새로 나옴'", () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const w = (n: number) => isoWeek(new Date(Date.now() - n * 7 * 86_400_000));
    expect(trendOf({ firstSeenAt: old, weeks: { [w(0)]: 5, [w(1)]: 3, [w(2)]: 1, [w(3)]: 1 } }).trend).toBe("up");
    expect(trendOf({ firstSeenAt: old, weeks: { [w(0)]: 0, [w(1)]: 1, [w(2)]: 4, [w(3)]: 4 } }).trend).toBe("down");
    expect(trendOf({ firstSeenAt: new Date().toISOString(), weeks: { [w(0)]: 1 } }).trend).toBe("new");
  });
});
