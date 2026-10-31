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
function drawPov(g: SKRSContext2D, text: string, W: number, top: number) {
  if (!plainText(text)) return;
  const maxW = W * 0.8;
  const { lines, px } = fitLines(g, text, "fs_semi", Math.round(W * 0.042), maxW, 2);
  g.font = `${px}px fs_semi`;
  const w = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 1.4;
  const h = lines.length * px * 1.35 + px * 0.8;
  g.fillStyle = "rgba(255,255,255,0.94)";
  roundRect(g, (W - w) / 2, top, w, h, px * 0.35);
  g.fill();
  g.fillStyle = "#111111";
  g.textAlign = "center";
  g.textBaseline = "top";
  lines.forEach((l, k) => g.fillText(l, W / 2, top + px * 0.45 + k * px * 1.35));
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
    drawImage(g, await load(approvedOf(looks[0].images)!.key), 0, 0, W, H, "cover");
    drawPov(g, p.settings.pov || p.title, W, 70);
    await put("00_cover", c.toBuffer("image/png"));
  }
  for (const [i, look] of looks.entries()) {
    const c = createCanvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, W, H);
    // 왼쪽: 착용 사진 (9:16 그대로 다 보이게)
    drawImage(g, await load(approvedOf(look.images)!.key), 24, 110, 600, 1140, "contain");
    // 오른쪽: 제품 사진 (위에서 아래로)
    const items = look.itemIds.map((id) => p.items.find((x) => x.id === id)).filter((x): x is FashionItem => Boolean(x?.imageKey)).slice(0, 4);
    const boxH = items.length ? Math.min(380, 1140 / items.length) : 0;
    const top = 110 + (1140 - boxH * items.length) / 2;
    for (const [k, it] of items.entries()) {
      try {
        drawImage(g, await load(it.imageKey!), 650, top + k * boxH + 8, 400, boxH - 16, "contain");
      } catch {
        /* 제품 사진을 못 읽으면 빈 칸 */
      }
    }
    drawLookLabel(g, lookNo(i), 40, 36, 30);
    if (look.caption.trim()) {
      const { lines, px } = fitLines(g, look.caption, "fs_semi", 34, W - 120, 1);
      g.font = `${px}px fs_semi`;
      g.fillStyle = "#3f3a33";
      g.textAlign = "right";
      g.textBaseline = "middle";
      g.fillText(lines[0], W - 44, 64);
    }
    await put(String(i + 1).padStart(2, "0"), c.toBuffer("image/png"));
  }
  return keys;
}

/** 릴스 한 컷 위에 얹는 투명 PNG (POV 고정 · LOOK 라벨 · 한 줄 설명) */
function reelOverlay(p: FashionProject, look: FashionLook | null, i: number, W: number, H: number): Buffer {
  const c = createCanvas(W, H);
  const g = c.getContext("2d");
  drawPov(g, p.settings.pov || p.title, W, H * 0.085);
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
    for (const part of parts) {
      const src = part.look ?? looks[looks.length - 1];
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
    const bgm = p.bgmKey ? await videoStorage.download(p.bgmKey).catch(() => null) : null;
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
