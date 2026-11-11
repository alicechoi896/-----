import "server-only";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approvedOf } from "@/lib/fashion/prompts";
import { WEEKDAYS, feedFormatOf, reelFormatOf } from "@/lib/fashion/formats";
import type { FashionItem, FashionLook, FashionProject, FashionRender } from "@/lib/fashion/types";
import { mediaDuration, runFfmpeg } from "../video/ffmpeg";
import { getTTSProvider } from "../providers/registry";
import { VOICE_OPTIONS, atempoFor, captionChunks, voiceInstructions } from "@/lib/video-production/config";
import { videoStorage } from "../video/storage";
import { fashionDir } from "./store";

/**
 * 결과물 (v0.9.103, 외부 유료 호출 없음)
 * - 피드: 4:5(1080×1350) 카드 — 표지(첫 룩 + POV 문구) + 룩마다 '왼쪽 착용 사진 · 오른쪽 제품 사진 · LOOK 01 라벨' (레퍼런스 피드 구성)
 * - 릴스 (가): 9:16 — 룩 사진마다 N초, 살짝 다가가는 움직임, 위쪽 POV 고정 · LOOK 라벨 · 한 줄 설명, 마지막 댓글 안내, 음악
 */
const FONT_DIR = path.join(process.cwd(), "node_modules", "pretendard", "dist", "public", "static");
let fontsReady = false;
function fonts(): void {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "Pretendard-SemiBold.otf"), "fs_semi");
  GlobalFonts.registerFromPath(path.join(FONT_DIR, "Pretendard-Bold.otf"), "fs_bold");
  // v0.9.171 피드 'LOOK 01' 세리프 (Libre Baskerville, SIL OFL — assets/fonts)
  GlobalFonts.registerFromPath(path.join(process.cwd(), "assets", "fonts", "LibreBaskerville-Regular.ttf"), "fs_serif");
  fontsReady = true;
}

/** 글꼴(Pretendard)에 없는 이모지는 네모(□)로 깨지므로 뺀다 */
export const plainText = (t: string) =>
  t
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** 줄 나누기 (최대 maxLines 줄, 넘치면 글자 크기를 줄인다) */
function fitLines(g: SKRSContext2D, raw: string, family: string, start: number, maxW: number, maxLines: number): { lines: string[]; px: number } {
  const text = plainText(raw);
  let px = start;
  for (; px >= 18; px -= 2) {
    g.font = `${px}px ${family}`;
    const lines: string[] = [];
    let cur = "";
    for (const ch of text.split(/(\s+)/)) {
      const next = cur + ch;
      if (g.measureText(next).width > maxW && cur.trim()) {
        lines.push(cur.trim());
        cur = ch.trimStart();
      } else cur = next;
    }
    if (cur.trim()) lines.push(cur.trim());
    // 띄어쓰기 없이 긴 줄은 글자 단위로
    const fixed = lines.flatMap((l) => {
      if (g.measureText(l).width <= maxW) return [l];
      const out: string[] = [];
      let c = "";
      for (const ch of l) {
        if (g.measureText(c + ch).width > maxW) {
          out.push(c);
          c = ch;
        } else c += ch;
      }
      return c ? [...out, c] : out;
    });
    if (fixed.length <= maxLines) return { lines: fixed, px };
  }
  return { lines: [text.slice(0, 20)], px: 18 };
}

function roundRect(g: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** 위쪽 POV 문구: 흰 상자 + 검은 글자 (레퍼런스와 같은 모양) */
/**
 * POV 문구 상자. at 이 있으면 그 점(가운데)에, 없으면 위쪽 가운데(top).
 * v0.9.169: 모델 얼굴을 가리지 않게 사람이 자리를 고른다 (화면 밖으로는 안 나가게)
 */
function drawPov(g: SKRSContext2D, text: string, W: number, top: number, at?: { cx: number; cy: number; H: number } | null) {
  if (!plainText(text)) return;
  const maxW = W * 0.8;
  const { lines, px } = fitLines(g, text, "fs_semi", Math.round(W * 0.042), maxW, 2);
  g.font = `${px}px fs_semi`;
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 1.4;
  const h = lines.length * px * 1.35 + px * 0.8;
  const m = W * 0.02;
  const x = at ? Math.min(W - w - m, Math.max(m, at.cx - w / 2)) : (W - w) / 2;
  const y = at ? Math.min(at.H - h - m, Math.max(m, at.cy - h / 2)) : top;
  g.fillStyle = "rgba(255,255,255,0.94)";
  roundRect(g, x, y, w, h, px * 0.35);
  g.fill();
  g.fillStyle = "#111111";
  g.textAlign = "center";
  g.textBaseline = "top";
  lines.forEach((l, k) => g.fillText(l, x + w / 2, y + px * 0.45 + k * px * 1.35));
}

/** v0.9.169 9:16 사진 기준 자리(0~1) → cover 로 그린 화면의 점 (피드 표지 4:5 는 위아래가 잘려서 다시 맞춘다) */
function povPoint(pos: { x: number; y: number } | null | undefined, W: number, H: number, imgW = 9, imgH = 16): { cx: number; cy: number; H: number } | null {
  if (!pos) return null;
  const sc = Math.max(W / imgW, H / imgH);
  const dw = imgW * sc;
  const dh = imgH * sc;
  return { cx: (W - dw) / 2 + pos.x * dw, cy: (H - dh) / 2 + pos.y * dh, H };
}

/** 'LOOK 01' 타원 라벨 */
function drawLookLabel(g: SKRSContext2D, label: string, x: number, y: number, size: number, color = "#222222") {
  g.font = `${size}px fs_semi`;
  const w = g.measureText(label).width + size * 1.6;
  const h = size * 1.7;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1.5, size * 0.07);
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, x + w / 2, y + h / 2 + 1);
}

/** 이미지 그리기: cover = 꽉 채워 자르기 / contain = 다 보이게 */
function drawImage(g: SKRSContext2D, img: Awaited<ReturnType<typeof loadImage>>, x: number, y: number, w: number, h: number, mode: "cover" | "contain") {
  const s = mode === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  g.restore();
}

const lookNo = (i: number) => `LOOK ${String(i + 1).padStart(2, "0")}`;

async function load(key: string) {
  const buf = await videoStorage.download(key);
  if (!buf) throw new Error("이미지를 불러오지 못했습니다. 다시 만들어 주세요.");
  return loadImage(buf);
}

/** 쓸 룩: 승인한 이미지가 있는 룩만, 순서대로 */
export const readyLooks = (p: FashionProject) => p.looks.filter((l) => approvedOf(l.images));

/* ───── v0.9.171 피드 룩 카드 (레퍼런스: 점무늬 크림 바탕 · 세리프 LOOK 타원 · 왼쪽 모델 전신 · 오른쪽 제품을 크기 달리해 배치) ───── */
const FEED_BG = "#F4F1EA";

function dotPaper(g: SKRSContext2D, W: number, H: number) {
  g.fillStyle = FEED_BG;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(120,108,92,0.22)";
  const step = 34;
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) g.fillRect(x - 1, y - 1, 2.2, 2.2);
}

/** 흰 여백을 잘라낸 사진 영역 (제품 사진이 칸 안에서 작아지지 않게) */
function trimBox(img: Awaited<ReturnType<typeof loadImage>>): { x: number; y: number; w: number; h: number } {
  const sw = Math.min(400, img.width);
  const sh = Math.max(1, Math.round((img.height * sw) / img.width));
  const c = createCanvas(sw, sh);
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, sw, sh);
  g.drawImage(img, 0, 0, sw, sh);
  const d = g.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const k = (y * sw + x) * 4;
      if (Math.min(d[k], d[k + 1], d[k + 2]) < 232) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 < x0 || y1 < y0) return { x: 0, y: 0, w: img.width, h: img.height };
  const s = img.width / sw;
  const pad = 2;
  const x = Math.max(0, (x0 - pad) * s);
  const y = Math.max(0, (y0 - pad) * s);
  return { x, y, w: Math.min(img.width - x, (x1 - x0 + 1 + pad * 2) * s), h: Math.min(img.height - y, (y1 - y0 + 1 + pad * 2) * s) };
}

/** 칸 안에 비율 그대로 (가로 가운데, align 위·가운데·아래). multiply 면 흰 배경이 바탕에 녹는다 */
function placeImage(g: SKRSContext2D, img: Awaited<ReturnType<typeof loadImage>>, box: { x: number; y: number; w: number; h: number }, x: number, y: number, w: number, h: number, align: "top" | "middle" | "bottom", multiply: boolean) {
  const sc = Math.min(w / box.w, h / box.h);
  const dw = box.w * sc;
  const dh = box.h * sc;
  const dy = align === "top" ? y : align === "bottom" ? y + h - dh : y + (h - dh) / 2;
  g.save();
  if (multiply) g.globalCompositeOperation = "multiply";
  g.drawImage(img, box.x, box.y, box.w, box.h, x + (w - dw) / 2, dy, dw, dh);
  g.restore();
}

/** 'LOOK 01' 세리프 타원 (레퍼런스처럼 가는 선) */
function drawSerifLabel(g: SKRSContext2D, label: string, x: number, y: number) {
  const size = 32;
  g.font = `${size}px fs_serif`;
  const tw = g.measureText(label).width;
  const w = tw + size * 1.9;
  const h = size * 1.75;
  g.strokeStyle = "#2b2b2b";
  g.lineWidth = 1.8;
  g.beginPath();
  g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#1f1f1f";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, x + w / 2, y + h / 2 + 2);
}

const ROW_OF: Record<FashionItem["category"], "top" | "dress" | "bottom" | "small"> = { outer: "top", top: "top", dress: "dress", bottom: "bottom", shoes: "small", bag: "small", acc: "small" };
const ROW_WEIGHT = { top: 1, dress: 1.7, bottom: 0.95, small: 0.5 };

async function drawLookCard(g: SKRSContext2D, p: FashionProject, look: FashionLook, i: number, W: number, H: number) {
  dotPaper(g, W, H);
  // 왼쪽: 모델 전신 — 피드용(밝은 무지 배경)이 있으면 그것을 바탕에 녹이고, 없으면 룩 이미지 그대로
  const feed = approvedOf(look.feedImages ?? []);
  const model = await load((feed ?? approvedOf(look.images)!).key);
  const mBox = feed ? trimBox(model) : { x: 0, y: 0, w: model.width, h: model.height };
  placeImage(g, model, mBox, 40, 150, 520, H - 190, "bottom", Boolean(feed));
  drawSerifLabel(g, lookNo(i), 44, 44);
  // 오른쪽: 제품 (상의·아우터 한 줄 → 원피스 → 하의 → 신발·가방·소품 한 줄)
  const items = look.itemIds.map((id) => p.items.find((x) => x.id === id)).filter((x): x is FashionItem => Boolean(x?.imageKey)).slice(0, 6);
  const order: ("top" | "dress" | "bottom" | "small")[] = ["top", "dress", "bottom", "small"];
  const rows = order.map((k) => ({ k, list: items.filter((it) => ROW_OF[it.category] === k) })).filter((r) => r.list.length);
  if (!rows.length) return;
  const X = 590;
  const RW = W - X - 40;
  const top = 70;
  const gap = 34;
  const total = H - top - 50 - gap * (rows.length - 1);
  const sum = rows.reduce((n, r) => n + ROW_WEIGHT[r.k], 0);
  let y = top;
  for (const r of rows) {
    const rh = (total * ROW_WEIGHT[r.k]) / sum;
    const cw = (RW - gap * (r.list.length - 1)) / r.list.length;
    for (const [k, it] of r.list.entries()) {
      try {
        const img = await load(it.imageKey!);
        placeImage(g, img, trimBox(img), X + k * (cw + gap), y, cw, rh, "middle", true);
      } catch {
        /* 제품 사진을 못 읽으면 빈 칸 */
      }
    }
    y += rh + gap;
  }
}

/* ───── v0.9.181 피드 유형 (레퍼런스: Letier 라벨 카드 · HABIMORE 문자 섬네일 · 겨울 아우터 플랫레이 · Vanessa 색 조합) ───── */
const shadowText = (g: SKRSContext2D, on: boolean) => {
  g.shadowColor = on ? "rgba(0,0,0,0.45)" : "transparent";
  g.shadowBlur = on ? 14 : 0;
  g.shadowOffsetY = on ? 2 : 0;
};
const CAT_EN: Record<FashionItem["category"], string> = { outer: "Outer", top: "Top", bottom: "Bottom", dress: "Dress", shoes: "Shoes", bag: "Bag", acc: "Acc" };

/** 라벨 카드: 크림 바탕 · 왼쪽 위 'A DAILY MOOD' · 손글씨 줄 · 왼쪽 모델 · 오른쪽 아이템 + 이름 라벨 · 아래 브랜드 */
async function drawLabelCard(g: SKRSContext2D, p: FashionProject, look: FashionLook, W: number, H: number) {
  g.fillStyle = "#F3EEE6";
  g.fillRect(0, 0, W, H);
  const lg = g.createLinearGradient(0, 0, W, H);
  lg.addColorStop(0, "rgba(255,255,255,0.5)");
  lg.addColorStop(1, "rgba(0,0,0,0.04)");
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  const feed = approvedOf(look.feedImages ?? []);
  const model = await load((feed ?? approvedOf(look.images)!).key);
  placeImage(g, model, feed ? trimBox(model) : { x: 0, y: 0, w: model.width, h: model.height }, 200, 60, 480, H - 120, "bottom", Boolean(feed));
  g.fillStyle = "#2a2522";
  g.textBaseline = "top";
  g.textAlign = "left";
  g.font = "34px fs_serif";
  ["A", "DAILY", "MOOD"].forEach((t, k) => g.fillText(t, 60, 60 + k * 38));
  g.font = "18px fs_serif";
  g.fillStyle = "#6b625b";
  ["simple", "feminine", "for you"].forEach((t, k) => g.fillText(t, 62, 190 + k * 22));
  // 손글씨 한 줄 (세로로 한 단어씩)
  g.save();
  g.font = "italic 40px fs_serif";
  g.fillStyle = "#2a2522";
  (p.settings.script || "for a better day").split(" ").filter(Boolean).slice(0, 4).forEach((t, k) => g.fillText(t, 44 + k * 8, H * 0.44 + k * 50));
  g.restore();
  // 오른쪽 아이템 + 라벨
  const items = look.itemIds.map((id) => p.items.find((x) => x.id === id)).filter((x): x is FashionItem => Boolean(x?.imageKey)).slice(0, 5);
  const X = 700;
  const top = 70;
  const each = (H - 200) / Math.max(1, items.length);
  for (const [k, it] of items.entries()) {
    const y = top + k * each;
    try {
      const img = await load(it.imageKey!);
      placeImage(g, img, trimBox(img), X, y, 250, each - 20, "middle", true);
    } catch {
      /* 빈 칸 */
    }
    g.fillStyle = "#2a2522";
    g.font = "26px fs_serif";
    g.textAlign = "left";
    g.fillText(CAT_EN[it.category], X + 262, y + each / 2 - 24);
    g.font = "15px fs_semi";
    g.fillStyle = "#6b625b";
    const { lines } = fitLines(g, it.name.toUpperCase(), "fs_semi", 15, W - X - 272, 2);
    lines.forEach((l, j) => g.fillText(l, X + 262, y + each / 2 + 8 + j * 18));
  }
  if (p.settings.brand) {
    g.fillStyle = "#2a2522";
    g.textAlign = "center";
    g.font = "48px fs_serif";
    g.fillText(p.settings.brand, 410, H - 110);
  }
}

/** 플랫레이·벽에 건 코디 한 장 (꽉 채움) + 표지 글자 · 색 칩 */
async function drawFlatSlide(g: SKRSContext2D, p: FashionProject, look: FashionLook, i: number, W: number, H: number) {
  const fd = feedFormatOf(p.settings.feedFormat);
  const flat = approvedOf(look.flatImages ?? []);
  drawImage(g, await load((flat ?? approvedOf(look.images)!).key), 0, 0, W, H, "cover");
  if (fd.value === "palette" && look.colors?.length) {
    const n = look.colors.length;
    const sz = 120;
    const gap = 26;
    const x0 = (W - (n * sz + (n - 1) * gap)) / 2;
    look.colors.forEach((c, k) => {
      const x = x0 + k * (sz + gap);
      g.fillStyle = "#ffffff";
      g.fillRect(x - 6, 36, sz + 12, sz + 52);
      g.fillStyle = c.hex;
      g.fillRect(x, 42, sz, sz);
      g.fillStyle = "#333333";
      g.font = "20px fs_semi";
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText(c.name.slice(0, 8), x + sz / 2, 42 + sz + 10);
    });
  }
  if (i !== 0) return;
  // 표지 글자
  const title = p.title || p.settings.pov;
  if (fd.value === "flatTitle") {
    let y = H * 0.18;
    g.textAlign = "left";
    g.textBaseline = "top";
    if (p.settings.coverTag) {
      g.font = "30px fs_bold";
      const tw = g.measureText(p.settings.coverTag).width + 40;
      g.fillStyle = "rgba(255,255,255,0.92)";
      g.fillRect(56, y, tw, 52);
      g.fillStyle = "#222";
      g.fillText(p.settings.coverTag, 76, y + 10);
      y += 76;
    }
    shadowText(g, true);
    const { lines, px } = fitLines(g, title, "fs_bold", 86, W * 0.48, 4);
    g.font = `${px}px fs_bold`;
    g.fillStyle = "#ffffff";
    lines.forEach((l, k) => g.fillText(l, 56, y + k * px * 1.2));
    y += lines.length * px * 1.2 + 20;
    if (p.settings.coverSub) {
      g.font = "30px fs_semi";
      g.fillText(p.settings.coverSub, 56, y);
    }
    shadowText(g, false);
  } else if (fd.value === "flatlay") {
    shadowText(g, true);
    g.textAlign = "left";
    g.textBaseline = "bottom";
    const { lines, px } = fitLines(g, title, "fs_bold", 84, W * 0.55, 3);
    g.font = `${px}px fs_bold`;
    g.fillStyle = "#ffffff";
    const y0 = H * 0.82;
    lines.forEach((l, k) => g.fillText(l, 56, y0 - (lines.length - 1 - k) * px * 1.18));
    if (p.settings.coverSub) {
      g.font = "30px fs_semi";
      g.fillText(p.settings.coverSub, 58, y0 - lines.length * px * 1.18 - 6);
    }
    shadowText(g, false);
  }
}

/** 피드 카드 PNG 들 (표지 + 룩마다) */
export async function renderFeed(owner: string, p: FashionProject, r: FashionRender): Promise<string[]> {
  fonts();
  const W = 1080;
  const H = 1350;
  const looks = readyLooks(p);
  const keys: string[] = [];
  const put = async (name: string, buf: Buffer) => {
    const key = `${fashionDir(owner, p.id)}/out/${r.id}_${name}.png`;
    await videoStorage.put(key, buf, "image/png");
    keys.push(key);
  };
  // v0.9.181 유형별: 라벨 카드 / 플랫레이·문자 섬네일·색 조합 (표지가 따로 없고 첫 장이 표지)
  const fd = feedFormatOf(p.settings.feedFormat);
  if (fd.value !== "card") {
    for (const [i, look] of looks.entries()) {
      const c = createCanvas(W, H);
      const g = c.getContext("2d");
      if (fd.value === "cardLabel") await drawLabelCard(g, p, look, W, H);
      else await drawFlatSlide(g, p, look, i, W, H);
      await put(String(i + 1).padStart(2, "0"), c.toBuffer("image/png"));
    }
    return keys;
  }
  // 표지: 첫 룩 + POV
  {
    const c = createCanvas(W, H);
    const g = c.getContext("2d");
    const coverImg = await load(approvedOf(looks[0].images)!.key);
    drawImage(g, coverImg, 0, 0, W, H, "cover");
    drawPov(g, p.settings.pov || p.title, W, 70, povPoint(p.settings.povPos, W, H, coverImg.width, coverImg.height));
    await put("00_cover", c.toBuffer("image/png"));
  }
  for (const [i, look] of looks.entries()) {
    const c = createCanvas(W, H);
    const g = c.getContext("2d");
    await drawLookCard(g, p, look, i, W, H);
    await put(String(i + 1).padStart(2, "0"), c.toBuffer("image/png"));
  }
  return keys;
}

/** 릴스 한 컷 위에 얹는 투명 PNG — v0.9.181 유형별 (POV 고정·첫 화면 큰 제목·없음 / LOOK·n번룩·요일 / 체형 줄 / 작은 안내) */
function reelOverlay(p: FashionProject, look: FashionLook | null, i: number, W: number, H: number, opts: { first?: boolean; bare?: boolean; noCaption?: boolean } = {}): Buffer {
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  const fmt = reelFormatOf(p.settings.format);
  const o = fmt.overlay;
  if (opts.bare) return c.toBuffer("image/png");
  if (o.pov === "fixed") drawPov(g, p.settings.pov || p.title, W, H * 0.085, povPoint(p.settings.povPos, W, H));
  if (o.pov === "firstBig" && opts.first) {
    // 첫 화면 큰 제목 (흰 글씨 + 분홍 빛 테두리, 레퍼런스 viva·언박싱·리뷰)
    const { lines, px } = fitLines(g, p.settings.pov || p.title, "fs_bold", 96, W * 0.86, 3);
    g.font = `${px}px fs_bold`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    const y0 = H * 0.42 - ((lines.length - 1) * px * 1.18) / 2;
    lines.forEach((l, k) => {
      const y = y0 + k * px * 1.18;
      g.shadowColor = "rgba(255,80,160,0.9)";
      g.shadowBlur = 24;
      g.lineWidth = Math.max(6, px * 0.12);
      g.strokeStyle = "#ff4fa3";
      g.strokeText(l, W / 2, y);
      g.shadowBlur = 0;
      g.fillStyle = "#ffffff";
      g.fillText(l, W / 2, y);
    });
  }
  const small = (t: string, x: number, y: number, px: number, align: CanvasTextAlign = "center", font = "fs_semi") => {
    g.save();
    g.font = `${px}px ${font}`;
    g.textAlign = align;
    g.textBaseline = "top";
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 8;
    g.fillStyle = "#ffffff";
    g.fillText(plainText(t), x, y);
    g.restore();
  };
  if (o.bodyLine && p.settings.bodyLine) small(p.settings.bodyLine, W / 2, H * 0.035, 40, "center", "fs_serif");
  if (o.noteLine && p.settings.noteLine) small(`* ${p.settings.noteLine}`, W / 2, H * 0.17, 26);
  if (look) {
    if (o.label === "look") {
      g.save();
      g.shadowColor = "rgba(0,0,0,0.45)";
      g.shadowBlur = 8;
      drawLookLabel(g, lookNo(i), W * 0.06, H * 0.2, 34, "#ffffff");
      g.restore();
    } else if (o.label === "num") small(`${i + 1}번룩`, W / 2, H * 0.53, 30);
    else if (o.label === "weekday") small(WEEKDAYS[i % WEEKDAYS.length], W * 0.06, H * 0.045, 46, "left", "fs_serif");
    if (o.caption && look.caption.trim() && !opts.noCaption) {
      const { lines, px } = fitLines(g, look.caption, "fs_bold", 52, W * 0.84, 2);
      g.font = `${px}px fs_bold`;
      g.textAlign = "center";
      g.textBaseline = "bottom";
      g.lineJoin = "round";
      lines.forEach((l, k) => {
        const y = H * 0.82 - (lines.length - 1 - k) * px * 1.25;
        g.lineWidth = Math.max(5, px * 0.16);
        g.strokeStyle = "rgba(0,0,0,0.85)";
        g.strokeText(l, W / 2, y);
        g.fillStyle = "#ffffff";
        g.fillText(l, W / 2, y);
      });
    }
  } else if (fmt.value !== "walking") {
    // 마지막: 댓글 안내 (가운데 큰 글씨)
    const { lines, px } = fitLines(g, p.settings.cta || "댓글에 '링크' 남겨 주세요", "fs_bold", 64, W * 0.82, 3);
    g.font = `${px}px fs_bold`;
    const h = lines.length * px * 1.3 + px;
    g.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(g, W * 0.06, H / 2 - h / 2, W * 0.88, h, 28);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "top";
    lines.forEach((l, k) => g.fillText(l, W / 2, H / 2 - h / 2 + px * 0.5 + k * px * 1.3));
  }
  return c.toBuffer("image/png");
}

/** v0.9.193 말 시작 전 여유 (초) */
const VO_LEAD = 0.15;
/** v0.9.193 말 자막 한 조각 (아래쪽 가운데, 흰 글씨 + 검은 테두리) */
function captionPng(text: string, W: number, H: number): Buffer {
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  const { lines, px } = fitLines(g, text, "fs_bold", 60, W * 0.86, 2);
  g.font = `${px}px fs_bold`;
  g.textAlign = "center";
  g.textBaseline = "bottom";
  g.lineJoin = "round";
  lines.forEach((l, k) => {
    const y = H * 0.8 - (lines.length - 1 - k) * px * 1.25;
    g.lineWidth = Math.max(6, px * 0.18);
    g.strokeStyle = "rgba(0,0,0,0.9)";
    g.strokeText(l, W / 2, y);
    g.fillStyle = "#ffffff";
    g.fillText(l, W / 2, y);
  });
  return c.toBuffer("image/png");
}

/** 릴스 (가): 룩 사진 + 움직임 + 문구 + 음악 → mp4 키 */
export async function renderReels(owner: string, p: FashionProject, r: FashionRender): Promise<{ key: string; totalSec: number }> {
  fonts();
  const W = 1080;
  const H = 1920;
  const FPS = 30;
  const looks = readyLooks(p);
  const sec = Math.min(4, Math.max(1.2, p.settings.secPerLook || 2));
  const ctaSec = 2.5;
  const dir = await mkdtemp(path.join(os.tmpdir(), "fs_reel_"));
  try {
    const segs: string[] = [];
    const fmt = reelFormatOf(p.settings.format);
    // v0.9.181 언박싱: 룩마다 '손으로 꺼내 펼침' 컷을 앞에 (있을 때만)
    type Part = { look: FashionLook | null; i: number; sec: number; first?: boolean; unbox?: boolean };
    const parts: Part[] = [];
    looks.forEach((l, i) => {
      const ub = fmt.unbox ? approvedOf(l.unboxImages ?? []) : null;
      if (ub) parts.push({ look: l, i, sec: Math.max(1.2, sec * 0.8), unbox: true });
      parts.push({ look: l, i, sec });
    });
    if (parts[0]) parts[0].first = true;
    parts.push({ look: null, i: looks.length, sec: ctaSec });
    // v0.9.193 AI 내레이션: 첫 컷 = POV(‘POV:’ 빼고) + 룩 한 줄, 룩 = 이 룩 내레이션(없으면 룩 문구), 마지막 = 댓글 안내. 언박싱 컷은 말 없음
    const vo = p.settings.voice?.on ? p.settings.voice : null;
    const speech: ({ file: string; dur: number; text: string } | null)[] = parts.map(() => null);
    if (vo) {
      const tts = await getTTSProvider(vo.ttsEngine).catch(() => null);
      const voice = vo.ttsEngine === "typecast" ? vo.voice : vo.voice || VOICE_OPTIONS[0].value;
      const tempo = atempoFor(Math.min(2, Math.max(1, vo.voiceSpeed || 1.5)));
      for (const [k, part] of parts.entries()) {
        const lookLine = part.look ? (part.look.voiceLine?.trim() || part.look.caption.trim()) : "";
        const text = part.unbox ? "" : part.look ? [part.first ? (p.settings.pov || "").replace(/^\s*POV\s*[:：]\s*/i, "").trim() : "", lookLine].filter(Boolean).join(". ") : (p.settings.cta || "").trim();
        if (!text || !tts || (vo.ttsEngine === "typecast" && !voice)) continue;
        try {
          const raw = path.join(dir, `tts${k}.mp3`);
          await writeFile(raw, await tts.synthesize(text, voice, voiceInstructions(vo.voiceStyle), { emotion: vo.ttsEmotion }));
          const wav = path.join(dir, `tts${k}.wav`);
          await runFfmpeg(["-y", "-i", raw, "-af", `silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse${tempo ? `,${tempo}` : ""}`, "-ar", "44100", "-ac", "2", wav], 60_000);
          const dur = await mediaDuration(wav);
          speech[k] = { file: wav, dur, text };
          // 말이 컷보다 길면 컷을 늘린다 (최대 8초)
          part.sec = Math.min(8, Math.max(part.sec, dur + VO_LEAD + 0.35));
        } catch (e) {
          console.warn("[FashionVoice]", JSON.stringify({ project: p.id, part: k, error: e instanceof Error ? e.message.slice(0, 120) : "?" }));
        }
      }
    }
    const capsOn = Boolean(vo?.captions);
    /** 말 자막 조각 PNG + 시각 (말소리 길이를 글자 수로 나눔) — 마지막 안내 컷은 가운데 상자가 있어 넣지 않는다 */
    const captionsFor = async (k: number): Promise<{ file: string; a: number; b: number }[]> => {
      const sp = speech[k];
      if (!capsOn || !sp || !parts[k].look) return [];
      const chunks = captionChunks(sp.text.replace(/\.\s+/g, " "), 14);
      const total = chunks.reduce((n, c) => n + c.replace(/\s/g, "").length, 0) || 1;
      const out: { file: string; a: number; b: number }[] = [];
      let at = VO_LEAD;
      for (const [j, c] of chunks.entries()) {
        const len = (sp.dur * c.replace(/\s/g, "").length) / total;
        const file = path.join(dir, `cap${k}_${j}.png`);
        await writeFile(file, captionPng(c, W, H));
        out.push({ file, a: at, b: j === chunks.length - 1 ? parts[k].sec : at + len });
        at += len;
      }
      return out;
    };
    const capInputs = (caps: { file: string }[]) => caps.flatMap((c) => ["-loop", "1", "-i", c.file]);
    const capFilter = (caps: { a: number; b: number }[], first: number) =>
      caps.length
        ? caps.map((c, j) => `[${j ? `c${j - 1}` : "v0"}][${first + j}:v]overlay=0:0:enable='between(t,${c.a.toFixed(3)},${(c.b - 0.001).toFixed(3)})'${j === caps.length - 1 ? ",format=yuv420p[v]" : `[c${j}]`}`).join(";")
        : "[v0]null[v]";
    const useClips = p.settings.reelStyle === "b";
    // 엘리베이터 문 (왼쪽·오른쪽 문짝 PNG, 컷 처음에 열리고 끝에 닫힘)
    const doorL = path.join(dir, "doorL.png");
    const doorR = path.join(dir, "doorR.png");
    if (fmt.doors) {
      for (const [file, flip] of [[doorL, false], [doorR, true]] as const) {
        const dc = createCanvas(W / 2, H);
        const dg = dc.getContext("2d");
        const gr = dg.createLinearGradient(0, 0, W / 2, 0);
        gr.addColorStop(0, flip ? "#c9ccd1" : "#9ea3aa");
        gr.addColorStop(0.5, "#e4e6ea");
        gr.addColorStop(1, flip ? "#9ea3aa" : "#c9ccd1");
        dg.fillStyle = gr;
        dg.fillRect(0, 0, W / 2, H);
        dg.fillStyle = "rgba(0,0,0,0.25)";
        dg.fillRect(flip ? 0 : W / 2 - 4, 0, 4, H);
        await writeFile(file, dc.toBuffer("image/png"));
      }
    }
    const doorFilter = (D: number) => {
      const prog = `min(1\\,min(t\\,${D.toFixed(3)}-t)/0.45)`;
      return `[bg0][2:v]overlay=x='-w*${prog}':y=0:eval=frame[bgd];[bgd][3:v]overlay=x='${W / 2}+w*${prog}':y=0:eval=frame[bg]`;
    };
    for (const part of parts) {
      const src = part.look ?? looks[looks.length - 1];
      const clip = useClips && part.look && !part.unbox ? (part.look.clips ?? []).find((c) => c.approved) : null;
      const clipBuf = clip ? await videoStorage.download(clip.key).catch(() => null) : null;
      if (clip && clipBuf) {
        // v0.9.120 릴스 (나): 룩 AI 영상 앞부분 N초 + 같은 문구
        const cf = path.join(dir, `clip${segs.length}.mp4`);
        await writeFile(cf, clipBuf);
        const k = segs.length;
        const caps = await captionsFor(k);
        const ovFile = path.join(dir, `ovc${k}.png`);
        await writeFile(ovFile, reelOverlay(p, part.look, part.i, W, H, { first: part.first, noCaption: caps.length > 0 }));
        const out = path.join(dir, `seg${k}.mp4`);
        const frames = Math.round(part.sec * FPS);
        await runFfmpeg(["-y", "-i", cf, "-i", ovFile, ...capInputs(caps), "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},tpad=stop_mode=clone:stop_duration=${part.sec},format=yuv420p[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v0];${capFilter(caps, 2)}`, "-map", "[v]", "-frames:v", String(frames), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out], 180_000);
        segs.push(out);
        continue;
      }
      const n = segs.length;
      const imgFile = path.join(dir, `in${n}.png`);
      const srcKey = part.unbox ? approvedOf(part.look!.unboxImages ?? [])!.key : approvedOf(src.images)!.key;
      await writeFile(imgFile, (await videoStorage.download(srcKey))!);
      const caps = await captionsFor(n);
      const ovFile = path.join(dir, `ov${n}.png`);
      await writeFile(ovFile, reelOverlay(p, part.look, part.i, W, H, { first: part.first, bare: part.unbox && !part.first, noCaption: caps.length > 0 }));
      const frames = Math.round(part.sec * FPS);
      const out = path.join(dir, `seg${n}.mp4`);
      // 살짝 다가가는 움직임 (1.00 → 1.06). 마지막 안내는 어둡게. 요일 룩은 문이 열리고 닫힘
      const doors = fmt.doors && part.look && !part.unbox;
      const base = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}${part.look ? "" : ",eq=brightness=-0.12"},format=yuv420p[${doors ? "bg0" : "bg"}]${doors ? `;${doorFilter(part.sec)}` : ""}`;
      await runFfmpeg(["-y", "-i", imgFile, "-i", ovFile, ...(doors ? ["-loop", "1", "-i", doorL, "-loop", "1", "-i", doorR] : []), ...capInputs(caps), "-filter_complex", `${base};[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v0];${capFilter(caps, doors ? 4 : 2)}`, "-map", "[v]", "-frames:v", String(frames), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out], 180_000);
      segs.push(out);
    }
    const list = path.join(dir, "list.txt");
    await writeFile(list, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
    const joined = path.join(dir, "joined.mp4");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined], 120_000);
    const total = parts.reduce((n, x) => n + x.sec, 0);
    const final = path.join(dir, "final.mp4");
    // v0.9.170 릴스에 음악은 넣지 않는다 (인스타·쇼츠 앱의 음악을 올릴 때 고른다). 무음 소리 트랙만
    const bgm: Buffer | null = null;
    if (bgm) {
      const bf = path.join(dir, `bgm${path.extname(p.bgmKey!) || ".mp3"}`);
      await writeFile(bf, bgm);
      const vol = Math.min(1, Math.max(0, p.settings.bgmVolume ?? 0.5));
      await runFfmpeg(["-y", "-i", joined, "-stream_loop", "-1", "-i", bf, "-filter_complex", `[1:a]volume=${vol},atrim=0:${total.toFixed(3)},afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(3)}:d=1.2[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart", final], 180_000);
    } else if (speech.some(Boolean)) {
      // v0.9.193 내레이션: 컷마다 (조금 뒤에 시작하는) 말소리를 컷 길이에 맞춰 이어 붙인다
      const pieces: string[] = [];
      for (const [k, part] of parts.entries()) {
        const pf = path.join(dir, `a${k}.wav`);
        const sp = speech[k];
        if (sp) await runFfmpeg(["-y", "-i", sp.file, "-af", `adelay=${Math.round(VO_LEAD * 1000)}|${Math.round(VO_LEAD * 1000)},apad,atrim=0:${part.sec.toFixed(3)}`, "-ar", "44100", "-ac", "2", pf], 60_000);
        else await runFfmpeg(["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", part.sec.toFixed(3), pf], 60_000);
        pieces.push(pf);
      }
      const alist = path.join(dir, "a.txt");
      await writeFile(alist, pieces.map((x) => `file '${x.replace(/\\/g, "/")}'`).join("\n"));
      const voiceWav = path.join(dir, "voice.wav");
      await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", voiceWav], 60_000);
      await runFfmpeg(["-y", "-i", joined, "-i", voiceWav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart", final], 120_000);
    } else {
      await runFfmpeg(["-y", "-i", joined, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-t", total.toFixed(3), "-movflags", "+faststart", final], 120_000);
    }
    const key = `${fashionDir(owner, p.id)}/out/${r.id}.mp4`;
    await videoStorage.put(key, await readFile(final), "video/mp4");
    return { key, totalSec: Number(total.toFixed(2)) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
