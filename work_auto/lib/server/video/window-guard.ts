/**
 * v0.9.185 사람이 정한 화면(영상 편집 설정·컷 화면)에도 프리셋 적용: 원본 자막·로고·중국어가 보이면 더 확대해서 가린다.
 * 좌표: 창은 '9:16 화면 기준'(원본을 꽉 채운 뒤, 0~1), 글자 상자는 원본 기준(0~1) → 여기서 9:16 화면 기준으로 바꿔 비교한다.
 * 창을 옮겨야 하면 제품 가운데(없으면 원래 창 가운데)에 가장 가깝게. 외부 의존 없음 (테스트 가능)
 */
export type Win = { x: number; y: number; w: number; h: number };

const OUT = 9 / 16;
/** 글자 둘레 여유 (9:16 화면 기준) */
const PAD = 0.04;
/** 사람이 정한 창 + 가리기로 더 확대할 때 최대 배율 (원본 기준) */
export const GUARD_MAX_ZOOM = 2.4;

/** 원본 좌표 상자 → 9:16 꽉 채우기 화면 좌표 (화면 밖이면 null) */
export function toOutput(b: Win, aspect: number): Win | null {
  let { x, y, w, h } = b;
  if (aspect > OUT) {
    const fw = OUT / aspect;
    x = (x - (1 - fw) / 2) / fw;
    w = w / fw;
  } else if (aspect < OUT) {
    const fh = aspect / OUT;
    y = (y - (1 - fh) / 2) / fh;
    h = h / fh;
  }
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(1, x + w);
  const y2 = Math.min(1, y + h);
  return x2 - x1 > 0.002 && y2 - y1 > 0.002 ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

function overlap(a: Win, b: Win): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
/** 창에서 실제로 보이는 곳 (위쪽 제목 띠 아래) */
function visible(win: Win, bar: number): Win {
  return { x: win.x, y: win.y + win.h * bar, w: win.w, h: win.h * (1 - bar) };
}
const r3 = (n: number) => Number(n.toFixed(3));

/**
 * 창 하나: 글자가 안 보이면 그대로. 보이면 같은 크기 → 조금씩 작게(더 확대) 하며 글자가 안 보이는 창 중
 * 기준점(제품 가운데 → 원래 창 가운데)에 가장 가까운 것. 끝까지 못 찾으면 null
 */
export function guardWindow(win: Win, marks: Win[], bar: number, focus: { x: number; y: number } | null): Win | null {
  if (!marks.some((m) => overlap(m, visible(win, bar)) > 0.00002)) return win;
  const fx = focus?.x ?? win.x + win.w / 2;
  const fy = focus?.y ?? win.y + win.h / 2;
  const step = 0.01;
  for (let s = win.w; s >= 1 / GUARD_MAX_ZOOM - 1e-9; s -= step) {
    const room = Math.max(0, 1 - s);
    const n = Math.max(1, Math.round(room / step));
    let best: Win | null = null;
    let bestD = Infinity;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const c = { x: (room * j) / n, y: (room * i) / n, w: s, h: s };
        const v = visible(c, bar);
        if (marks.some((m) => overlap(m, v) > 0.00002)) continue;
        const d = Math.abs(v.x + v.w / 2 - fx) + Math.abs(v.y + v.h / 2 - fy);
        if (d < bestD) {
          bestD = d;
          best = { x: r3(c.x), y: r3(c.y), w: r3(s), h: r3(s) };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** 컷의 창들(기본 + 시간별)을 모두 검사. 못 가린 창이 있으면 ok=false (그 창은 그대로 둔다) */
export function guardWindows(
  m: { base: Win | null; segs: { a: number; b: number; win: Win }[] },
  boxes: Win[],
  aspect: number,
  bar: number,
  product: Win | null,
): { base: Win | null; segs: { a: number; b: number; win: Win }[]; ok: boolean; changed: boolean } {
  const marks = boxes
    .filter((b) => !(b.w >= 0.99 && b.h >= 0.99))
    .map((b) => toOutput(b, aspect))
    .filter((b): b is Win => Boolean(b))
    .map((b) => ({ x: Math.max(0, b.x - PAD), y: Math.max(0, b.y - PAD), w: Math.min(1, b.w + PAD * 2), h: Math.min(1, b.h + PAD * 2) }));
  const p = product ? toOutput(product, aspect) : null;
  const focus = p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : null;
  let ok = true;
  let changed = false;
  const fix = (w: Win): Win => {
    const g = guardWindow(w, marks, bar, focus);
    if (!g) {
      ok = false;
      return w;
    }
    if (g !== w) changed = true;
    return g;
  };
  const full = { x: 0, y: 0, w: 1, h: 1 };
  const base0 = m.base ?? full;
  const base = fix(base0);
  const segs = m.segs.map((sg) => ({ ...sg, win: fix(sg.win) }));
  return { base: base === full ? null : base.w >= 0.999 ? null : base, segs, ok, changed };
}
