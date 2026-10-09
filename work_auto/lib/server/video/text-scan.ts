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
  samples: { t: number; boxes: Box[] }[];
  checked: boolean;
  interval: number;
}

const MAX_SAMPLES = 16;
const PER_CALL = 8;

export async function scanText(file: string, duration: number, dir: string, key: string): Promise<{ scan: TextScan; aiCalls: number }> {
  const ai = await getAIProvider();
  const interval = Math.max(1, duration / MAX_SAMPLES);
  const times: number[] = [];
  for (let t = Math.min(0.2, duration / 2); t < duration - 0.05 && times.length < MAX_SAMPLES; t += interval) times.push(Number(t.toFixed(2)));
  if (!ai.supportsVision) return { scan: { samples: times.map((t) => ({ t, boxes: [] })), checked: false, interval }, aiCalls: 0 };
  // 프레임 뽑기 (작게, 글자를 읽을 정도)
  const frames: { t: number; file: string }[] = [];
  for (const [i, t] of times.entries()) {
    const out = path.join(dir, `${key}_f${i}.jpg`);
    try {
      await runFfmpeg(["-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=-2:640", "-q:v", "4", out], 30_000);
      frames.push({ t, file: out });
    } catch {
      /* 이 프레임은 건너뛴다 → 아래에서 검사 안 된 것으로 */
    }
  }
  const samples: { t: number; boxes: Box[] }[] = [];
  let aiCalls = 0;
  let checked = frames.length === times.length;
  for (let i = 0; i < frames.length; i += PER_CALL) {
    const batch = frames.slice(i, i + PER_CALL);
    const parts: ChatContentPart[] = [];
    for (const f of batch) parts.push({ type: "image", mediaType: "image/jpeg", data: (await readFile(f.file)).toString("base64") });
    parts.push({
      type: "text",
      text: [
        `위 영상 프레임 ${batch.length}장을 순서대로 본다. 화면에 보이는 모든 글자(자막·설명 문구·중국어·영어·워터마크·로고 글자·스티커 글자)의 위치를 찾는다.`,
        "제품 본체에 인쇄된 아주 작은 글자(버튼 표시 등)는 빼도 된다. 읽을 수 있는 글자는 모두 넣는다.",
        '형식: JSON 만. {"frames":[{"i":1,"boxes":[[x,y,w,h],…]},…]} — x,y,w,h 는 화면 너비·높이 대비 0~1 비율, 글자가 없으면 boxes 는 [].',
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
        maxTokens: 1500,
      });
      const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { frames?: { i?: number; boxes?: number[][] }[] };
      for (const [j, f] of batch.entries()) {
        const row = json.frames?.find((r) => Number(r.i) === j + 1);
        if (!row) {
          checked = false;
          samples.push({ t: f.t, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] }); // 모르면 글자가 있다고 본다
          continue;
        }
        samples.push({ t: f.t, boxes: (row.boxes ?? []).filter((b) => b.length === 4).map(([x, y, w, h]) => clampBox({ x, y, w, h })) });
      }
    } catch {
      checked = false;
      for (const f of batch) samples.push({ t: f.t, boxes: [{ x: 0, y: 0, w: 1, h: 1 }] });
    }
  }
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
  /** blur: 원본 비율 상자 (여유 포함) */
  blur?: Box;
}

/**
 * 우선순위: 글자 없음 → 상단 제목 띠가 덮는 곳 → 확대·크롭 → 블러 → 사용 안 함.
 * 출력은 9:16 을 '꽉 채우기'로 만든다고 보고 원본 비율 좌표로 판단한다 (세로 영상 기준).
 */
export function decideTreatment(boxes: Box[], checked: boolean): Treatment {
  if (!checked) return { kind: "unchecked" };
  if (!boxes.length) return { kind: "clean" };
  const pad = VIDEO_RENDER_CONFIG.textMaskPadding;
  const u = union(boxes);
  const p: Box = clampBox({ x: u.x - pad, y: u.y - pad, w: u.w + pad * 2, h: u.h + pad * 2 });
  const barFrac = TOP_TITLE_TEMPLATE.barHeight / VIDEO_RENDER_CONFIG.height;
  // 상단 검은 띠 안에만 있으면 띠가 덮는다
  if (p.y + p.h <= barFrac) return { kind: "clean" };
  const maxZoom = VIDEO_RENDER_CONFIG.maxCropZoom;
  // 아래쪽 글자: 위쪽만 쓰도록 확대 (띠가 위 17%를 덮으므로 그만큼 위로 여유)
  if (p.y >= 1 - (1 - 1 / maxZoom)) {
    const h = p.y;
    if (1 / h <= maxZoom) return { kind: "crop", crop: { x: (1 - h) / 2, y: 0, w: h, h } };
  }
  // 위쪽 글자(띠 아래까지 내려옴): 아래쪽만 쓰도록 확대
  const top = p.y + p.h;
  // 창의 위 17%(띠가 덮는 곳)에 글자가 들어가도록: (1 - top) = h × (1 - 띠비율)
  const hTop = (1 - top) / (1 - barFrac);
  if (p.y <= 0.02 && hTop < 1 && 1 / hTop <= maxZoom) {
    return { kind: "crop", crop: { x: (1 - hTop) / 2, y: 1 - hTop, w: hTop, h: hTop } };
  }
  // 가운데 글자: 영역이 작으면 블러, 크면 쓰지 않는다
  if (p.w * p.h <= 0.18 && boxes.every((b) => b.w * b.h <= 0.18)) return { kind: "blur", blur: p };
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
