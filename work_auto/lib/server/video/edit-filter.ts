import { VIDEO_RENDER_CONFIG as C } from "@/lib/video-production/config";

/** v0.9.165 영상 편집 설정 → FFmpeg 필터 (렌더·테스트 공용, 외부 의존 없음) */
const W = C.width;
const H = C.height;

/** 9:16 화면 기준 창 → FFmpeg 자르기 (짝수 픽셀) */
function winCrop(win: { x: number; y: number; w: number; h: number }): string {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const w = even(W * win.w);
  const h = even(H * win.h);
  return `crop=${w}:${h}:${Math.min(W - w, Math.round(W * win.x))}:${Math.min(H - h, Math.round(H * win.y))},scale=${W}:${H}:flags=lanczos`;
}
/**
 * v0.9.165 사람이 정한 화면: 원본을 9:16 에 꽉 채운 뒤 → 기본 창을 잘라 키우고 → 시간별 확대는 그 구간(컷 안 시간)에만 덮는다.
 * 미리보기(previewStyle)와 같은 창 계산(outputWindow)이라 결과가 같다. 결과 라벨은 [base]
 */
export function manualFilter(m: { base: { x: number; y: number; w: number; h: number } | null; segs: { a: number; b: number; win: { x: number; y: number; w: number; h: number } }[] }): string {
  const cover = `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=${C.fps},setsar=1`;
  const n = m.segs.length;
  if (!n) return `[0:v]${cover}${m.base ? `,${winCrop(m.base)}` : ""},unsharp=5:5:0.45:5:5:0[base]`;
  let f = `[0:v]${cover},split=${n + 1}${Array.from({ length: n + 1 }, (_, i) => `[m${i}]`).join("")}`;
  f += `;[m0]${m.base ? winCrop(m.base) : "null"}[z0]`;
  m.segs.forEach((sg, j) => {
    f += `;[m${j + 1}]${winCrop(sg.win)}[s${j}];[z${j}][s${j}]overlay=0:0:enable='between(t,${sg.a.toFixed(3)},${(sg.b - 0.001).toFixed(3)})'[z${j + 1}]`;
  });
  return f + `;[z${n}]unsharp=5:5:0.45:5:5:0[base]`;
}
