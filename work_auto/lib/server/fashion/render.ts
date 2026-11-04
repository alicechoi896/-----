import "server-only";
import { createCanvas, GlobalFonts, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approvedOf } from "@/lib/fashion/prompts";
import type { FashionItem, FashionLook, FashionProject, FashionRender } from "@/lib/fashion/types";
import { runFfmpeg } from "../video/ffmpeg";
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

/** 릴스 한 컷 위에 얹는 투명 PNG (POV 고정 · LOOK 라벨 · 한 줄 설명) */
function reelOverlay(p: FashionProject, look: FashionLook | null, i: number, W: number, H: number): Buffer {
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  drawPov(g, p.settings.pov || p.title, W, H * 0.085, povPoint(p.settings.povPos, W, H));
  if (look) {
    g.save();
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowBlur = 8;
    drawLookLabel(g, lookNo(i), W * 0.06, H * 0.2, 34, "#ffffff");
    g.restore();
    if (look.caption.trim()) {
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
  } else {
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
    const parts = [...looks.map((l, i) => ({ look: l as FashionLook | null, i, sec })), { look: null, i: looks.length, sec: ctaSec }];
    const useClips = p.settings.reelStyle === "b";
    for (const part of parts) {
      const src = part.look ?? looks[looks.length - 1];
      const clip = useClips && part.look ? (part.look.clips ?? []).find((c) => c.approved) : null;
      const clipBuf = clip ? await videoStorage.download(clip.key).catch(() => null) : null;
      if (clip && clipBuf) {
        // v0.9.120 릴스 (나): 룩 AI 영상 앞부분 N초 + 같은 문구
        const cf = path.join(dir, `clip${part.i}.mp4`);
        await writeFile(cf, clipBuf);
        const ovFile = path.join(dir, `ov${part.i}.png`);
        await writeFile(ovFile, reelOverlay(p, part.look, part.i, W, H));
        const out = path.join(dir, `seg${part.i}.mp4`);
        const frames = Math.round(part.sec * FPS);
        await runFfmpeg(["-y", "-i", cf, "-i", ovFile, "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},tpad=stop_mode=clone:stop_duration=${part.sec},format=yuv420p[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`, "-map", "[v]", "-frames:v", String(frames), "-r", String(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out], 180_000);
        segs.push(out);
        continue;
      }
      const imgFile = path.join(dir, `in${part.i}.png`);
      await writeFile(imgFile, (await videoStorage.download(approvedOf(src.images)!.key))!);
      const ovFile = path.join(dir, `ov${part.i}.png`);
      await writeFile(ovFile, reelOverlay(p, part.look, part.i, W, H));
      const frames = Math.round(part.sec * FPS);
      const out = path.join(dir, `seg${part.i}.mp4`);
      // 살짝 다가가는 움직임 (1.00 → 1.06). 마지막 안내는 어둡게
      const base = `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}${part.look ? "" : ",eq=brightness=-0.12"},format=yuv420p[bg]`;
      await runFfmpeg(["-y", "-i", imgFile, "-i", ovFile, "-filter_complex", `${base};[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`, "-map", "[v]", "-frames:v", String(frames), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out], 180_000);
      segs.push(out);
    }
    const list = path.join(dir, "list.txt");
    await writeFile(list, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
    const joined = path.join(dir, "joined.mp4");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined], 120_000);
    const total = looks.length * sec + ctaSec;
    const final = path.join(dir, "final.mp4");
    // v0.9.170 릴스에 음악은 넣지 않는다 (인스타·쇼츠 앱의 음악을 올릴 때 고른다). 무음 소리 트랙만
    const bgm: Buffer | null = null;
    if (bgm) {
      const bf = path.join(dir, `bgm${path.extname(p.bgmKey!) || ".mp3"}`);
      await writeFile(bf, bgm);
      const vol = Math.min(1, Math.max(0, p.settings.bgmVolume ?? 0.5));
      await runFfmpeg(["-y", "-i", joined, "-stream_loop", "-1", "-i", bf, "-filter_complex", `[1:a]volume=${vol},atrim=0:${total.toFixed(3)},afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(3)}:d=1.2[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), "-movflags", "+faststart", final], 180_000);
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
