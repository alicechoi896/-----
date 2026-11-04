/**
 * AI 숙소 영상 시간표 (v0.9.171) — 영상과 대사를 따로 흐르게
 * - 영상: 컷마다 정한 시간(없으면 자동)으로 끊김 없이 이어진다
 * - 대사: 0.2초부터 줄마다 차례로 (사이 0.25초). 컷 경계와 상관없이 이어 읽는다
 * - 영상 전체가 대사보다 짧으면, 시간을 정하지 않은 컷부터 늘린다 (AI 컷 길이 안에서)
 */
export const STAY_LEAD_SEC = 0.2;
export const STAY_LINE_GAP_SEC = 0.25;
export const STAY_TAIL_SEC = 0.8;
export const STAY_AUTO_CUT_SEC = 2.5;

export interface StayTimeline {
  /** 컷 길이 */
  cuts: number[];
  /** 컷 시작 (영상 전체 기준) */
  cutStarts: number[];
  /** 대사 줄 시작·끝 (영상 전체 기준) */
  lines: { from: number; to: number }[];
  total: number;
  /** 컷을 다 늘려도 대사가 더 길면 true (끝 대사가 잘림) */
  overflow: boolean;
}

export function stayTimeline(lineSec: number[], holdSec: (number | null | undefined)[], maxCut: number): StayTimeline {
  const lines: { from: number; to: number }[] = [];
  let t = STAY_LEAD_SEC;
  for (const d of lineSec) {
    lines.push({ from: t, to: t + Math.max(0, d) });
    t += Math.max(0, d) + STAY_LINE_GAP_SEC;
  }
  const need = (lines.length ? lines[lines.length - 1].to : 0) + STAY_TAIL_SEC;
  const n = lineSec.length;
  const fixed = holdSec.map((h) => (h && h > 0 ? Math.min(maxCut, h) : null));
  const cuts = fixed.map((h) => h ?? STAY_AUTO_CUT_SEC);
  // 모자라면 자동 컷부터 고르게 늘리고, 그래도 모자라면 정한 컷도 (최대 maxCut)
  for (const pool of [fixed.map((h, i) => (h == null ? i : -1)).filter((i) => i >= 0), cuts.map((_, i) => i)]) {
    let short = need - cuts.reduce((a, b) => a + b, 0);
    let open = pool.filter((i) => cuts[i] < maxCut);
    while (short > 0.001 && open.length) {
      const each = short / open.length;
      for (const i of open) {
        const add = Math.min(each, maxCut - cuts[i]);
        cuts[i] += add;
        short -= add;
      }
      open = open.filter((i) => cuts[i] < maxCut - 0.001);
    }
  }
  const cutStarts: number[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    cutStarts.push(at);
    at += cuts[i];
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { cuts: cuts.map(r), cutStarts: cutStarts.map(r), lines, total: r(at), overflow: at + 0.001 < need };
}

/** 컷 하나에 보일 자막: 그 컷 시간과 겹치는 대사 줄 (컷 안 시간으로) */
export function stayCaptionsFor(tl: StayTimeline, k: number): { line: number; from: number; to: number }[] {
  const a = tl.cutStarts[k];
  const b = a + tl.cuts[k];
  return tl.lines
    .map((l, i) => ({ line: i, from: Math.max(l.from, a) - a, to: Math.min(l.to + STAY_LINE_GAP_SEC, b) - a }))
    .filter((x) => x.to - x.from > 0.05);
}
