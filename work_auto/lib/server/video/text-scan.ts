import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAIProvider } from "../providers/registry";
import type { ChatContentPart } from "../providers/types";
import { VIDEO_RENDER_CONFIG, TOP_TITLE_TEMPLATE } from "@/lib/video-production/config";
import type { TextTreatment } from "@/lib/types/video-production";
import { runFfmpeg } from "./ffmpeg";

/**
 * 원본 영상의 글자·자막 찾기 (v0.9.51) — 새 유료 API 없이, 연결된 AI(Claude/OpenAI)의 이미지 읽기로.
 * - 클립마다 약 1초 간격으로 최대 16장을 뽑아 (8장씩) AI 에 보내고, 글자 영역(0~1 비율 상자)을 받는다.
 * - 샘플 사이는 '모른다'로 보고, 양옆 샘플의 상자를 합쳐서 판단한다 (중간 프레임에서 글자가 보이는 일을 막는다).
 * - AI 가 이미지를 못 읽으면(데모·미연결) 'unchecked' → 최종 결과는 검수 필요.
 */
export type Box = { x: number; y: number; w: number; h: number };
export interface TextScan {
  /** 샘플 시각(초)마다 글자 상자 */
  samples: { t: number; boxes: Box[]; score?: number; desc?: string }[];
  checked: boolean;
  interval: number;
}

// v0.9.79: 클립마다 12장 · AI 1회 (전에는 16장 · 2회) — 영상 만들기가 5분을 넘기던 원인
const MAX_SAMPLES = 12;
const PER_CALL = 12;
/** 검사 결과 저장 버전 (프롬프트를 바꾸면 올린다) */
export const SCAN_VERSION = 3;

export async function scanText(file: string, duration: number, dir: string, key: string): Promise<{ scan: TextScan; aiCalls: number }> {
  const ai = await getAIProvider();
  const interval = Math.max(1, duration / MAX_SAMPLES);
  const times: number[] = [];
  for (let t = Math.min(0.2, duration / 2); t < duration - 0.05 && times.length < MAX_SAMPLES; t += interval) times.push(Number(t.toFixed(2)));
  if (!ai.supportsVision) return { scan: { samples: times.map((t) => ({ t, boxes: [] })), checked: false, interval }, aiCalls: 0 };
  // 프레임 뽑기 (작게, 글자를 읽을 정도)
  // v0.9.67: 4장씩 동시에 → v0.9.79: 6장씩
  const got: ({ t: number; file: string } | null)[] = new Array(times.length).fill(null);
  for (let i = 0; i < times.length; i += 6) {
    await Promise.all(
      times.slice(i, i + 6).map(async (t, j) => {
        const out = path.join(dir, `${key}_f${i + j}.jpg`);
        try {
          await runFfmpeg(["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=-2:640", "-q:v", "4", out], 30_000);
          got[i + j] = { t, file: out };
        } catch {
          /* 이 프레임은 건너뛴다 → 아래에서 검사 안 된 것으로 */
        }
      }),
    );
  }
  const frames = got.filter((x): x is { t: number; file: string } => Boolean(x));
  const samples: TextScan["samples"] = [];
  let aiCalls = 0;
  let checked = frames.length === times.length;
  // v0.9.67: 묶음(8장)마다 AI 검사를 동시에
  const batches: { t: number; file: string }[][] = [];
  for (let i = 0; i < frames.length; i += PER_CALL) batches.push(frames.slice(i, i + PER_CALL));
  await Promise.all(batches.map(async (batch) => {
    const parts: ChatContentPart[] = [];
    for (const f of batch) parts.push({ type: "image", mediaType: "image/jpeg", data: (await readFile(f.file)).toString("base64") });
    parts.push({
      type: "text",
      text: [
        `위 영상 프레임 ${batch.length}장을 순서대로 본다. 쇼츠 제품 영상에 쓸 장면을 고르려고 한다.`,
        "1) boxes: 화면에 보이는 모든 글자(자막·설명 문구·중국어·영어·스티커 글자)와 로고·워터마크(샤오홍슈 로고·계정 ID·@이름·채널 로고·브랜드 로고 이미지, 글자가 없어도)의 위치. 제품 본체에 인쇄된 아주 작은 글자는 빼도 된다.",
        "2) score: 이 장면을 제품 홍보 영상에 쓸 만한 정도 0~10. 높게: 제품이 크고 선명하게 보임, 손으로 쓰는 동작·사용 장면, 결과가 보이는 장면. 낮게: 인트로·아웃트로·검은 화면·흔들림·어두움·사람 얼굴만·글자 화면·제품이 안 보임.",
        "3) desc: 장면을 한국어 10~25자로, 제품의 어떤 기능·동작을 보여 주는지 드러나게 (예: '충전 케이블 꽂는 손', '물 뿌려 방수 시험', '청소기로 바닥 미는 손', '한 손으로 가볍게 들기', '제품 박스 클로즈업').",
        '형식: JSON 만. {"frames":[{"i":1,"boxes":[[x,y,w,h],…],"score":7,"desc":"…"},…]} — x,y,w,h 는 화면 너비·높이 대비 0~1 비율, 글자가 없으면 boxes 는 [].',
      ].join("\n"),
    });
    try {
      aiCalls++;
      const { text } = await ai.generateText({
        task: "video-text-scan",
        messages: [
          { role: "system", content: "당신은 영상 프레임에서 글자 위치를 정확히 찾는 도우미다. 확실하지 않으면 상자를 넉넉하게 잡는다. JSON 만 답한다." },
          { role: "user", content: parts },
        ],
        maxTokens: 2500,
      });
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { frames?: { i?: number; boxes?: number[][]; score?: number; desc?: string }[] };
      for (const [j, f] of batch.entries()) {
        const row = json.frames?.find((r) => Number(r.i) === j + 1);
        if (!row) {
          checked = false;
          samples.push({ t: f.t, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] }); // 모르면 글자가 있다고 본다
          continue;
        }
        samples.push({
          t: f.t,
          boxes: (row.boxes ?? []).filter((b) => b.length === 4).map(([x, y, w, h]) => clampBox({ x, y, w, h })),
          score: Number.isFinite(Number(row.score)) ? Math.min(10, Math.max(0, Number(row.score))) : undefined,
          desc: typeof row.desc === "string" ? row.desc.slice(0, 40) : undefined,
        });
      }
    } catch {
      checked = false;
      for (const f of batch) samples.push({ t: f.t, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] });
    }
  }));
  samples.sort((a, b) => a.t - b.t);
  return { scan: { samples, checked, interval }, aiCalls };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number(v) || 0));
function clampBox(b: Box): Box {
  const x = clamp01(b.x);
  const y = clamp01(b.y);
  return { x, y, w: Math.min(1 - x, clamp01(b.w)), h: Math.min(1 - y, clamp01(b.h)) };
}

/** 구간 [start, start+dur] 에 걸리는 글자 상자 (양옆 샘플까지 포함 + 시간 여유) */
export function boxesIn(scan: TextScan, start: number, dur: number): Box[] {
  const pad = VIDEO_RENDER_CONFIG.textMaskTimePaddingSec + scan.interval;
  return scan.samples.filter((s) => s.t >= start - pad && s.t <= start + dur + pad).flatMap((s) => s.boxes);
}

export interface Treatment {
  kind: TextTreatment;
  /** crop: 원본에서 쓸 영역 (0~1) */
  crop?: Box;
  /** blur: 원본 비율 상자 (여유 포함). v0.9.66: 여러 개 */
  blur?: Box;
  blurs?: Box[];
}

/** 샤오홍슈 자막이 주로 있는 아래쪽 띠 (글자 검사를 못 했을 때 기본 블러, v0.9.66) */
export const SUBTITLE_BAND: Box = { x: 0.04, y: 0.7, w: 0.92, h: 0.2 };
/** 블러 합계가 화면의 이 비율을 넘으면 쓰지 않는다 */
const MAX_BLUR_AREA = 0.3;

/** 가까운 상자끼리 합친다 (같은 줄 자막 조각을 하나로) */
function mergeNear(boxes: Box[]): Box[] {
  const out: Box[] = [];
  for (const b of [...boxes].sort((a, c) => a.y - c.y)) {
    const hit = out.find((o) => !(b.x > o.x + o.w + 0.03 || b.x + b.w < o.x - 0.03 || b.y > o.y + o.h + 0.03 || b.y + b.h < o.y - 0.03));
    if (hit) Object.assign(hit, union([hit, b]));
    else out.push({ ...b });
  }
  return out;
}

/** 9:16 출력 비율 */
const OUT_ASPECT = 9 / 16;
/** 상자끼리 겹치는 넓이 */
function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
/**
 * 원본에서 창(정사각 비율 s, 원본과 같은 모양)을 잘라 9:16 꽉 채우기로 만들 때 '보이는 곳' 중 상단 제목 띠 아래 영역.
 * 이 영역에 글자·로고가 하나도 없으면 그 창은 쓸 수 있다.
 */
function exposed(win: Box, aspect: number, barFrac: number): Box {
  const fw = aspect > OUT_ASPECT ? OUT_ASPECT / aspect : 1;
  const fh = aspect < OUT_ASPECT ? aspect / OUT_ASPECT : 1;
  const vx = win.x + (win.w * (1 - fw)) / 2;
  const vy = win.y + (win.h * (1 - fh)) / 2;
  const vh = win.h * fh;
  return { x: vx, y: vy + vh * barFrac, w: win.w * fw, h: vh * (1 - barFrac) };
}
/**
 * 글자·로고가 보이지 않게 하는 가장 덜 확대한 창 (v0.9.76). 없으면 null.
 * 배율 1 → maxZoom 으로 조금씩 키우며, 같은 배율이면 화면 가운데에 가까운 창.
 */
export function findCrop(boxes: Box[], aspect = OUT_ASPECT, maxZoom: number = VIDEO_RENDER_CONFIG.maxCropZoom): Box | null {
  const barFrac = TOP_TITLE_TEMPLATE.barHeight / VIDEO_RENDER_CONFIG.height;
  const step = 0.01;
  for (let s = 1; s >= 1 / maxZoom - 1e-9; s -= step) {
    const room = Math.max(0, 1 - s);
    const n = Math.round(room / step);
    let best: Box | null = null;
    let bestD = Infinity;
    for (let i = 0; i <= n; i++) {
      const y = n ? (room * i) / n : 0;
      for (let j = 0; j <= n; j++) {
        const x = n ? (room * j) / n : 0;
        const win = { x, y, w: s, h: s };
        const ex = exposed(win, aspect, barFrac);
        if (boxes.some((b) => overlap(b, ex) > 0.00002)) continue;
        const d = Math.abs(x + s / 2 - 0.5) + Math.abs(y + s / 2 - 0.5);
        if (d < bestD) {
          bestD = d;
          best = { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), w: Number(s.toFixed(4)), h: Number(s.toFixed(4)) };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

const decided = new Map<string, Treatment>();
/**
 * 우선순위 (v0.9.76): 글자·로고 없음(또는 상단 띠·꽉 채우기로 이미 안 보임) → 확대로 안 보이게 → 블러 → 사용 안 함.
 * 좌표는 원본 비율(0~1). aspect = 원본 가로÷세로 (꽉 채우기에서 잘리는 양옆·위아래 계산).
 */
export function decideTreatment(boxes: Box[], checked: boolean, aspect = OUT_ASPECT): Treatment {
  const key = `${checked ? 1 : 0}|${aspect.toFixed(3)}|${boxes.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)},${b.w.toFixed(3)},${b.h.toFixed(3)}`).join(";")}`;
  const hit = decided.get(key);
  if (hit) return hit;
  const tr = decide(boxes, checked, aspect);
  if (decided.size > 5000) decided.clear();
  decided.set(key, tr);
  return tr;
}

function decide(boxes: Box[], checked: boolean, aspect: number): Treatment {
  // 글자 검사를 못 했으면 아래 자막 띠(샤오홍슈 중국어 자막)를 확대로 잘라 내고, 안 되면 블러
  if (!checked) {
    const crop = findCrop([SUBTITLE_BAND], aspect);
    return crop ? { kind: "unchecked", crop } : { kind: "unchecked", blur: SUBTITLE_BAND, blurs: [SUBTITLE_BAND] };
  }
  if (!boxes.length) return { kind: "clean" };
  const pad = VIDEO_RENDER_CONFIG.textMaskPadding;
  // 확대 판단은 여유를 조금만 (너무 크게 확대하지 않게)
  const padded = boxes.map((b) => clampBox({ x: b.x - pad / 2, y: b.y - pad / 2, w: b.w + pad, h: b.h + pad }));
  const full = findCrop(padded, aspect, 1);
  if (full) return { kind: "clean" };
  const crop = findCrop(padded, aspect);
  if (crop) return { kind: "crop", crop };
  // 확대로 안 되면 블러 (상자마다 따로, 상단 띠가 덮는 것은 빼고). 합계가 너무 크면 사용 안 함
  const barFrac = TOP_TITLE_TEMPLATE.barHeight / VIDEO_RENDER_CONFIG.height;
  const blurs = mergeNear(boxes)
    .map((b) => clampBox({ x: b.x - pad, y: b.y - pad * 0.6, w: b.w + pad * 2, h: b.h + pad * 1.2 }))
    .filter((b) => b.y + b.h > barFrac);
  const area = blurs.reduce((n, b) => n + b.w * b.h, 0);
  if (blurs.length && area <= MAX_BLUR_AREA) return { kind: "blur", blur: blurs[0], blurs };
  return { kind: "rejected" };
}

function union(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x));
  const y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w));
  const y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const TREATMENT_RANK: Record<TextTreatment, number> = { clean: 0, crop: 1, blur: 2, unchecked: 3, rejected: 9 };

/**
 * 컷마다 원본 구간 고르기 (v0.9.67): 앞에서부터가 아니라 '쓸모 있는 장면'을.
 * 점수 = 대사·장면 설명 맞음(×3) + 장면 쓸모 점수(0~10 ×0.6) − 글자 처리 벌점(×2) + 이 컷에 정한 원본(+1)
 * 이미 쓴 구간과 겹치지 않고, 가릴 수 없는 글자(rejected)는 건너뛴다. 같은 점수면 앞 구간.
 */
// v0.9.76: 자막·로고는 확대로 가리는 것을 블러보다 먼저
const PENALTY: Record<TextTreatment, number> = { clean: 0, crop: 0.7, blur: 1.5, unchecked: 2, rejected: 99 };
const JOSA = /(으로|에서|까지|부터|처럼|이에요|예요|해요|하죠|이죠|은|는|이|가|을|를|에|도|로|의|만|요|죠|고|다)$/;
export const wordsOf = (text: string) =>
  [...new Set(text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).map((w) => w.replace(JOSA, "")).filter((w) => w.length >= 2))];

export interface SegmentSource {
  id: string;
  duration: number;
  scan: TextScan;
  assigned: boolean;
  /** 사람이 고른 클립 (v0.9.78: 뜻 매핑보다 우선) */
  pinned?: boolean;
  /** 원본 가로÷세로 (꽉 채우기에서 잘리는 부분 계산, 없으면 9:16) */
  aspect?: number;
}
/** v0.9.78: 대사와 뜻이 맞는 장면(want)을 품은 구간 보너스 */
const WANT_BONUS = 6;
export function pickSegment(input: { narration: string; dur: number; sources: SegmentSource[]; used: Map<string, [number, number][]>; want?: { id: string; t: number } | null }): { id: string; start: number; tr: Treatment; value: number } | null {
  const words = wordsOf(input.narration);
  let best: { id: string; start: number; tr: Treatment; value: number } | null = null;
  for (const src of input.sources) {
    const ranges = input.used.get(src.id) ?? [];
    const maxStart = Math.max(0, src.duration - input.dur - 0.1);
    const steps = Math.max(1, Math.floor(maxStart / 0.5));
    for (let n = 0; n <= steps; n++) {
      const start = (maxStart * n) / steps;
      if (ranges.some(([a, b]) => start < b && start + input.dur > a)) continue;
      const tr = decideTreatment(boxesIn(src.scan, start, input.dur), src.scan.checked, src.aspect);
      if (tr.kind === "rejected") continue;
      // 이 구간의 장면들 (없으면 가장 가까운 장면)
      let inRange = src.scan.samples.filter((x) => x.t >= start && x.t <= start + input.dur);
      if (!inRange.length && src.scan.samples.length) inRange = [[...src.scan.samples].sort((a, b) => Math.abs(a.t - start) - Math.abs(b.t - start))[0]];
      const scores = inRange.map((x) => x.score).filter((x): x is number => typeof x === "number");
      const quality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;
      const desc = inRange.map((x) => x.desc ?? "").join(" ");
      const match = Math.min(3, words.filter((w) => desc.includes(w)).length);
      const wanted = input.want && input.want.id === src.id && input.want.t >= start - 0.3 && input.want.t <= start + input.dur + 0.3 ? WANT_BONUS : 0;
      const value = match * 3 + quality * 0.6 - PENALTY[tr.kind] * 2 + (src.assigned ? (src.pinned ? 8 : 1) : 0) + wanted;
      if (!best || value > best.value + 1e-9) best = { id: src.id, start, tr, value };
    }
  }
  return best;
}
