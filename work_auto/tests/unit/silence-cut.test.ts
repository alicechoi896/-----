import { describe, expect, it } from "vitest";
const { keepSegments, parseSilences } = await import("@/lib/silence-cut");

describe("무음 구간 자르기 (v0.9.70)", () => {
  it("silencedetect 출력 읽기 (끝까지 무음이면 영상 끝까지)", () => {
    const log = "[silencedetect @ 0x1] silence_start: 1.02\n[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.48\n[silencedetect @ 0x1] silence_start: 4.9";
    expect(parseSilences(log, 6)).toEqual([
      [1.02, 2.5],
      [4.9, 6],
    ]);
  });
  it("남길 구간: 말 앞뒤 여유, 겹치면 합치고, 아주 짧은 조각은 버림", () => {
    expect(keepSegments([[1, 2], [3, 4]], 5, 0.05)).toEqual([
      [0, 1.05],
      [1.95, 3.05],
      [3.95, 5],
    ]);
    // 앞이 무음이면 0부터가 아니라 말부터
    expect(keepSegments([[0, 1.5]], 3, 0)).toEqual([[1.5, 3]]);
    // 여유 때문에 겹치면 하나로
    expect(keepSegments([[1, 1.05]], 3, 0.05)).toEqual([[0, 3]]);
  });
});
