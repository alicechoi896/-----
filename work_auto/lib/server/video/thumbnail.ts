import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { VideoJob } from "@/lib/types/video-production";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { runFfmpeg } from "./ffmpeg";
import { videoStorage } from "./storage";
import { srcKeyOf } from "./vault";
import { thumbFamily } from "./text-image";

/**
 * v0.9.147 섬네일 이미지 — 영상에 쓴 원본 장면 한 프레임 + 섬네일 제목(상단 제목 2번째 줄)을 크게.
 * 세로 1080×1920 (쇼츠 표지) · 가로 1280×720 (일반 섬네일). 외부 호출 없음.
 * 원본이 보관돼 있으면 원본에서(자막 없는 깨끗한 화면), 없으면 완성 영상에서 프레임을 뽑는다.
 */
export interface ThumbResult {
  keys: { vertical: string; horizontal: string };
  urls: { vertical: string | null; horizontal: string | null };
  sceneIndex: number;
  text: string;
}

const thumbKey = (owner: string, jobId: string, kind: "v" | "h") => `${owner}/thumb/${jobId}_${kind}.png`;

/** 글자를 줄 단위로 (10자 안팎이라 보통 1~2줄) */
function lines(text: string): string[] {
  const t = text.trim();
  if (t.length <= 7) return [t];
  const words = t.split(/\s+/);
  if (words.length > 1) {
    const half = Math.ceil(t.length / 2);
    let a = "";
    for (const w of words) {
      if ((a + " " + w).trim().length <= half || !a) a = (a + " " + w).trim();
      else break;
    }
    return [a, t.slice(a.length).trim()].filter(Boolean);
  }
  return [t.slice(0, Math.ceil(t.length / 2)), t.slice(Math.ceil(t.length / 2))];
}

async function frameFrom(file: string, at: number, out: string): Promise<boolean> {
  try {
    await runFfmpeg(["-ss", String(Math.max(0, at)), "-i", file, "-frames:v", "1", "-q:v", "3", out], 30_000);
    return true;
  } catch {
    return false;
  }
}

async function compose(frame: Buffer, text: string, w: number, h: number): Promise<Buffer> {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const img = await loadImage(frame);
  // 꽉 채우기 (가로 섬네일은 흐린 배경 + 가운데 원본)
  const cover = Math.max(w / img.width, h / img.height);
  ctx.filter = w > h ? "blur(24px) brightness(0.7)" : "none";
  ctx.drawImage(img, (w - img.width * cover) / 2, (h - img.height * cover) / 2, img.width * cover, img.height * cover);
  ctx.filter = "none";
  if (w > h) {
    const fit = Math.min(w / img.width, h / img.height);
    ctx.drawImage(img, w * 0.62 - (img.width * fit) / 2, (h - img.height * fit) / 2, img.width * fit, img.height * fit);
  }
  // 글자 아래 어둡게
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.15)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const fam = thumbFamily();
  const ls = lines(text);
  const maxW = w > h ? w * 0.5 : w * 0.9;
  let size = w > h ? 120 : 190;
  for (; size > 40; size -= 4) {
    ctx.font = `${size}px ${fam}`;
    if (Math.max(...ls.map((l) => ctx.measureText(l).width)) <= maxW) break;
  }
  ctx.textAlign = w > h ? "left" : "center";
  ctx.textBaseline = "top";
  const x = w > h ? w * 0.05 : w / 2;
  let y = w > h ? (h - ls.length * size * 1.15) / 2 : h * 0.08;
  for (const [i, l] of ls.entries()) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.round(size * 0.16);
    ctx.strokeStyle = "#000000";
    ctx.strokeText(l, x, y);
    ctx.fillStyle = i === ls.length - 1 && ls.length > 1 ? "#FFE94D" : "#FFFFFF";
    ctx.fillText(l, x, y);
    y += size * 1.15;
  }
  return canvas.toBuffer("image/png");
}

/** 섬네일 이미지 만들기 (sceneIndex: 프레임을 뽑을 컷, text: 없으면 상단 제목 2번째 줄) */
export async function makeThumbnail(jobId: string, opts: { sceneIndex?: number; text?: string } = {}): Promise<ThumbResult> {
  const owner = await getCurrentUserId();
  const job = (await getRepositories().videoJobs.get(jobId)) as VideoJob | null;
  if (!job || job.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾지 못했습니다.", 404);
  const scenes = job.plan.scenes;
  const idx = Math.min(scenes.length - 1, Math.max(0, Math.round(Number(opts.sceneIndex ?? Math.min(1, scenes.length - 1)))));
  const s = scenes[idx];
  const text = (opts.text ?? job.plan.topLine2 ?? "").replace(/[[\]]/g, "").trim().slice(0, 30) || job.plan.selectedTitle.slice(0, 12);
  const dir = await mkdtemp(path.join(os.tmpdir(), "thumb_"));
  try {
    const frame = path.join(dir, "f.jpg");
    let ok = false;
    // 1) 보관한 원본 (자막 없는 화면)
    if (s?.sourceVideoId) {
      const src = await videoStorage.download(srcKeyOf(owner, s.sourceVideoId)).catch(() => null);
      if (src) {
        const f = path.join(dir, "src.mp4");
        await writeFile(f, src);
        ok = await frameFrom(f, (s.startAt ?? s.sourceStart ?? 0) + 0.5, frame);
      }
    }
    // 2) 완성 영상
    if (!ok && job.outputPath) {
      const out = await videoStorage.download(job.outputPath).catch(() => null);
      if (out) {
        const f = path.join(dir, "out.mp4");
        await writeFile(f, out);
        ok = await frameFrom(f, (s?.start ?? 0) + 0.5, frame);
      }
    }
    if (!ok) throw new AppError("NO_FRAME", "영상 화면을 가져오지 못했습니다 (원본·완성 영상 파일이 없습니다).", 400);
    const buf = await readFile(frame);
    const [v, h] = await Promise.all([compose(buf, text, 1080, 1920), compose(buf, text, 1280, 720)]);
    const keys = { vertical: thumbKey(owner, job.id, "v"), horizontal: thumbKey(owner, job.id, "h") };
    await videoStorage.put(keys.vertical, v, "image/png", "0");
    await videoStorage.put(keys.horizontal, h, "image/png", "0");
    await getRepositories().videoJobs.update(job.id, { qa: { ...job.qa, thumbnail: { ...keys, sceneIndex: idx, text } } as VideoJob["qa"] });
    const urls = await videoStorage.urls([keys.vertical, keys.horizontal], 3600).catch(() => ({}) as Record<string, string>);
    return { keys, urls: { vertical: urls[keys.vertical] ?? null, horizontal: urls[keys.horizontal] ?? null }, sceneIndex: idx, text };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** 이미 만든 섬네일 주소 */
export async function thumbnailUrls(job: VideoJob): Promise<{ vertical: string | null; horizontal: string | null } | null> {
  const t = job.qa?.thumbnail;
  if (!t) return null;
  const urls = await videoStorage.urls([t.vertical, t.horizontal], 3600).catch(() => ({}) as Record<string, string>);
  return { vertical: urls[t.vertical] ?? null, horizontal: urls[t.horizontal] ?? null };
}
