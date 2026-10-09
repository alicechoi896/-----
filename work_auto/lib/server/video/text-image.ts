import "server-only";
import { writeFile } from "node:fs/promises";
import { createCanvas, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { CAPTION_TEMPLATE, ENDING_TEMPLATE, TOP_TITLE_TEMPLATE, VIDEO_RENDER_CONFIG } from "@/lib/video-production/config";
import { videoAssets } from "./assets";

/**
 * 글자 → 투명 PNG (v0.9.52). 서버용 FFmpeg(ffmpeg-static 리눅스)에는 글자 그리기(drawtext)가 없어서,
 * 상단 제목·자막·엔딩을 @napi-rs/canvas 로 미리 그리고 FFmpeg 로 영상 위에 얹는다. 디자인은 config 의 고정 템플릿 그대로.
 * 글자가 넘치면 크기만 줄인다 (실제 글자 폭을 재서).
 */
const W = VIDEO_RENDER_CONFIG.width;
const H = VIDEO_RENDER_CONFIG.height;
const registered = new Map<string, string>();

/** 템플릿 글꼴 키 → 등록한 글꼴 이름 (없으면 Pretendard) */
function family(key: string): { name: string; fallback: boolean } {
  const f = videoAssets.font(key);
  const name = `vp_${key}${f.fallback ? "_fb" : ""}`;
  if (!registered.has(name)) {
    GlobalFonts.registerFromPath(f.file, name);
    registered.set(name, f.file);
  }
  return { name, fallback: f.fallback };
}

const cssColor = (c: string) => (c.startsWith("0x") ? `#${c.slice(2)}` : c);

/** 넓이에 맞게 글자 크기 줄이기 */
function fit(ctx: SKRSContext2D, text: string, fam: string, size: number, maxWidth: number, weight = ""): number {
  let s = size;
  for (; s > size * 0.5; s -= 2) {
    ctx.font = `${weight} ${s}px ${fam}`.trim();
    const widest = Math.max(...text.split("\n").map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth) break;
  }
  return s;
}

function strokeFill(ctx: SKRSContext2D, text: string, x: number, y: number, fill: string, stroke: string | null, strokeW: number) {
  if (stroke && strokeW > 0) {
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeW * 2;
    ctx.strokeStyle = cssColor(stroke);
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = cssColor(fill);
  ctx.fillText(text, x, y);
}

export interface TextImages {
  fallbackFonts: string[];
}

/** 상단 검은 띠 + 2줄 (1080 × barHeight) */
export async function renderTitleBar(file: string, line1: string, line2: string): Promise<boolean> {
  const t = TOP_TITLE_TEMPLATE;
  const fam = family(t.font);
  const c = createCanvas(W, t.barHeight);
  const ctx = c.getContext("2d");
  ctx.fillStyle = t.barColor;
  ctx.fillRect(0, 0, W, t.barHeight);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `${fit(ctx, line1, fam.name, t.line1.size, W * 0.92)}px ${fam.name}`;
  strokeFill(ctx, line1, W / 2, t.line1.y, t.line1.color, null, 0);
  ctx.font = `${fit(ctx, line2, fam.name, t.line2.size, W * 0.92)}px ${fam.name}`;
  strokeFill(ctx, line2, W / 2, t.line2.y, t.line2.color, null, 0);
  await writeFile(file, c.toBuffer("image/png"));
  return !fam.fallback;
}

/** 자막 한 컷 (1080 × 440, 투명) — 화면 y = centerY·H - 220 에 얹는다 */
export const CAPTION_BOX_H = 440;
export async function renderCaption(file: string, text: string): Promise<boolean> {
  const t = CAPTION_TEMPLATE;
  const fam = family(t.font);
  const c = createCanvas(W, CAPTION_BOX_H);
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = fit(ctx, text, fam.name, t.size, W * 0.88);
  ctx.font = `${size}px ${fam.name}`;
  const lines = text.split("\n");
  const lh = size * 1.25;
  const top = CAPTION_BOX_H / 2 - (lh * (lines.length - 1)) / 2;
  lines.forEach((l, i) => strokeFill(ctx, l, W / 2, top + i * lh, t.color, t.borderColor, t.borderW));
  await writeFile(file, c.toBuffer("image/png"));
  return !fam.fallback;
}
export const captionY = () => Math.round(H * CAPTION_TEMPLATE.centerY - CAPTION_BOX_H / 2);

/** 엔딩 '최저가 / 구매링크' (투명, 1080 × 420) — 화면 y = ENDING_TEMPLATE.y - 40 */
export const ENDING_BOX_H = 420;
export async function renderEnding(file: string): Promise<boolean> {
  const t = ENDING_TEMPLATE;
  const fam = family(t.font);
  const c = createCanvas(W, ENDING_BOX_H);
  const ctx = c.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = 40;
  for (const line of t.lines) {
    ctx.font = `${line.size}px ${fam.name}`;
    strokeFill(ctx, line.text, t.x, y, line.color, t.borderColor, t.borderW);
    y += line.size + 14;
  }
  await writeFile(file, c.toBuffer("image/png"));
  return !fam.fallback;
}
export const endingY = () => ENDING_TEMPLATE.y - 40;
