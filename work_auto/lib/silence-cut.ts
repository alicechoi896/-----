/**
 * 무음 구간 자르기 (v0.9.70) — 화면·서버 공용 설정과 계산. docs/SILENCE_CUT.md
 * 무음: 소리가 noiseDb 보다 작은 상태가 minSilence 초 이상 이어진 곳 → 전부 잘라 낸다 (말 앞뒤는 pad 초만 남김).
 */
export const SILENCE_OPTIONS = {
  minSilence: [0.1, 0.2, 0.3, 0.5, 1] as const,
  noiseDb: [
    { value: -30, label: "작은 소리도 무음으로" },
    { value: -35, label: "기본" },
    { value: -40, label: "아주 조용할 때만" },
  ] as const,
  pad: [0, 0.05, 0.1] as const,
};
export const SILENCE_DEFAULTS = { minSilence: 0.2, noiseDb: -35, pad: 0.05 };
export const SILENCE_LIMITS = { maxBytes: 300 * 1024 * 1024, maxDurationSec: 20 * 60 };

export interface SilenceCutResult {
  url: string;
  /** 받기 전용 주소 (파일 이름 지정) */
  downloadUrl: string;
  fileName: string;
  beforeSec: number;
  afterSec: number;
  removedSec: number;
  cuts: number;
}

/** 무음 구간 [시작, 끝] → 남길 구간 (말 앞뒤 pad 초 여유, 겹치면 합침, 아주 짧은 조각은 버림) */
export function keepSegments(silences: [number, number][], duration: number, pad: number, minKeep = 0.08): [number, number][] {
  const sorted = [...silences].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const keeps: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of sorted) {
    const end = Math.min(duration, a + pad);
    if (end - cur >= minKeep) keeps.push([cur, end]);
    cur = Math.max(cur, b - pad);
  }
  if (duration - cur >= minKeep) keeps.push([cur, duration]);
  // 여유 때문에 겹친 구간은 합친다
  const merged: [number, number][] = [];
  for (const k of keeps) {
    const last = merged[merged.length - 1];
    if (last && k[0] <= last[1]) last[1] = Math.max(last[1], k[1]);
    else merged.push([Math.max(0, k[0]), k[1]]);
  }
  return merged.map(([a, b]) => [Number(a.toFixed(3)), Number(b.toFixed(3))]);
}

/** ffmpeg silencedetect 출력 → 무음 구간 */
export function parseSilences(stderr: string, duration: number): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start != null) {
      out.push([start, Number(e[1])]);
      start = null;
    }
  }
  if (start != null) out.push([start, duration]); // 끝까지 무음
  return out;
}
