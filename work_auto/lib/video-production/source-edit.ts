/**
 * 영상 편집 설정 (v0.9.165) — 영상 라이브러리에서 정하고, 컷 계획에 복사해 영상 제작에서 고치고, 렌더가 그대로 쓴다.
 * 미리보기(CSS)와 렌더(FFmpeg)는 이 파일의 같은 함수로 화면을 계산한다 → 미리보기와 결과가 같다.
 *
 * 좌표: 모두 '9:16 화면 기준'(원본을 1080×1920 에 꽉 채운 뒤의 화면, 0~1). 시간: 원본 영상의 초.
 * - range: 이 영상의 시작 초(from). 이 영상을 쓰는 컷은 from 부터 각 컷 길이만큼 차례로 잘린다 — 끝은 컷 계획(컷 초)으로 정해지므로 받지 않는다 (v0.9.166)
 * - frame: 기본 화면 (확대 배율·화면 중심)
 * - zooms: 시간별 확대 — from~to 초 동안 그 배율·위치 (겹치면 나중 것이 우선)
 */
export interface Frame {
  zoom: number;
  x: number;
  y: number;
}
export interface ZoomSeg extends Frame {
  from: number;
  to: number;
}
export interface SourceEdit {
  /** v0.9.166 시작 초만 (to 는 예전 데이터 호환용 — 쓰지 않는다) */
  range?: { from: number; to?: number } | null;
  frame?: Frame | null;
  zooms?: ZoomSeg[];
}

export const EDIT_MAX_ZOOM = 2.4;
export const EDIT_MAX_ZOOMS = 12;
const r3 = (n: number) => Number(n.toFixed(3));

/** 배율·중심 → 9:16 화면에서 보여 줄 창 (0~1, 정가운데 기준으로 가장자리 밖으로 안 나감) */
export function outputWindow(f: Frame): { x: number; y: number; w: number; h: number } {
  const z = Math.min(EDIT_MAX_ZOOM, Math.max(1, Number(f.zoom) || 1));
  const w = 1 / z;
  const clamp = (v: number) => Math.min(1 - w, Math.max(0, v - w / 2));
  return { x: r3(clamp(f.x)), y: r3(clamp(f.y)), w: r3(w), h: r3(w) };
}

/** 미리보기 CSS (object-fit: cover 영상에 적용). outputWindow 와 같은 창을 보여 준다 */
export function previewStyle(f: Frame | null | undefined): { transform: string; transformOrigin: string } | undefined {
  if (!f || f.zoom <= 1.001) return undefined;
  const win = outputWindow(f);
  const ox = win.w < 0.999 ? (win.x / (1 - win.w)) * 100 : 50;
  const oy = win.h < 0.999 ? (win.y / (1 - win.h)) * 100 : 50;
  return { transform: `scale(${1 / win.w})`, transformOrigin: `${ox}% ${oy}%` };
}

/** 원본 t 초에 보일 화면: 그 시간을 덮는 시간별 확대(나중 것 우선) → 기본 화면 → 없음 */
export function frameAt(edit: SourceEdit | null | undefined, t: number): Frame | null {
  const zs = edit?.zooms ?? [];
  for (let i = zs.length - 1; i >= 0; i--) if (t >= zs[i].from && t < zs[i].to) return zs[i];
  return edit?.frame && edit.frame.zoom > 1.001 ? edit.frame : null;
}

const cleanFrameValue = (raw: unknown): Frame | null => {
  const r = raw as Partial<Frame> | null;
  if (!r || !Number.isFinite(Number(r.zoom)) || !Number.isFinite(Number(r.x)) || !Number.isFinite(Number(r.y))) return null;
  const one = (v: unknown) => Math.min(1, Math.max(0, r3(Number(v))));
  return { zoom: Math.min(EDIT_MAX_ZOOM, Math.max(1, Number(Number(r.zoom).toFixed(2)))), x: one(r.x), y: one(r.y) };
};

/** 저장 전 정리. 예전 형식(Frame 만 저장)도 받는다. 비면 null */
export function cleanEdit(raw: unknown): SourceEdit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // 예전 형식: { zoom, x, y }
  if ("zoom" in o && !("frame" in o) && !("zooms" in o) && !("range" in o)) {
    const f = cleanFrameValue(o);
    return f && f.zoom > 1.001 ? { frame: f } : null;
  }
  const sec = (v: unknown) => Math.min(3600, Math.max(0, Number(Number(v).toFixed(2))));
  let range: SourceEdit["range"] = null;
  const rr = o.range as { from?: unknown } | null | undefined;
  // v0.9.166 시작만 — 끝(to)은 버린다 (컷 계획의 컷 길이로 정해짐). 0초 시작은 '처음부터(자동)'와 같아 저장하지 않는다
  if (rr && Number.isFinite(Number(rr.from)) && sec(rr.from) > 0) range = { from: sec(rr.from) };
  const frame = cleanFrameValue(o.frame);
  const zooms = (Array.isArray(o.zooms) ? o.zooms : [])
    .map((z) => {
      const f = cleanFrameValue(z);
      const zz = z as { from?: unknown; to?: unknown };
      if (!f || !Number.isFinite(Number(zz.from)) || !Number.isFinite(Number(zz.to))) return null;
      const from = sec(zz.from);
      const to = sec(zz.to);
      return to - from >= 0.1 ? { ...f, from, to } : null;
    })
    .filter((z): z is ZoomSeg => Boolean(z))
    .slice(0, EDIT_MAX_ZOOMS);
  const out: SourceEdit = {};
  if (range) out.range = range;
  if (frame && frame.zoom > 1.001) out.frame = frame;
  if (zooms.length) out.zooms = zooms;
  return Object.keys(out).length ? out : null;
}

/** 컷 하나(원본 start 초부터 dur 초)에 쓸 화면: 기본 창 + 컷 안 시간(0~dur)으로 바꾼 확대 구간 */
export function cutWindows(edit: SourceEdit | null | undefined, start: number, dur: number): { base: ReturnType<typeof outputWindow> | null; segs: { a: number; b: number; win: ReturnType<typeof outputWindow> }[] } {
  const base = edit?.frame && edit.frame.zoom > 1.001 ? outputWindow(edit.frame) : null;
  const segs = (edit?.zooms ?? [])
    .map((z) => ({ a: Math.max(0, z.from - start), b: Math.min(dur, z.to - start), win: outputWindow(z) }))
    .filter((x) => x.b - x.a > 0.01)
    .map((x) => ({ a: r3(x.a), b: r3(x.b), win: x.win }));
  return { base, segs };
}

/** 이 영상의 n 번째 사용(앞 컷들이 쓴 길이 used)의 시작 초: 시작 초부터 이어서, 영상 끝을 넘으면 시작 초로 돌아간다 */
export function sequentialStart(range: { from: number; to?: number }, used: number, dur: number, srcDuration: number): number {
  const span = Math.max(0, srcDuration - range.from - dur);
  if (span <= 0.05) return Math.max(0, Math.min(range.from, srcDuration - dur - 0.05));
  return r3(range.from + (used % (span + 0.001)));
}
