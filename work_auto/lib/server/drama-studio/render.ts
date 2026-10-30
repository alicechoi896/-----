import "server-only";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import { projectDir } from "./store";
import type { DramaProject, DramaRender } from "@/lib/drama-studio/types";

/**
 * 최종 병합 (v0.9.81) — 타임라인 순서대로 승인한 클립을 하나의 MP4 로.
 * 클립마다: 다듬기(앞·뒤) → 프로젝트 비율 해상도로 맞춤(잘리지 않게 여백) → 30fps → 소리(끄면 무음) → 페이드(선택)
 * → 이어 붙이기(copy) → 배경음악(선택, 반복·볼륨) → Storage {project}/render/r{n}.mp4
 * Vercel 함수 안에서 after() 로 돈다 (최대 800초). 실패해도 클립은 그대로라 다시 렌더할 수 있다.
 * Supabase 무료 한도(파일 50MB) 안에 들도록 720p·최대 2Mbps.
 */
export const RENDER_LIMITS = { maxClips: 80, maxTotalSec: 600, maxBytes: 48 * 1024 * 1024 };
const FPS = 30;

async function hasAudio(file: string): Promise<boolean> {
  const r = await runFfmpeg(["-i", file, "-t", "0", "-f", "null", "-"], 30_000).catch((e: { stderr?: string }) => ({ stderr: e?.stderr ?? "" }));
  return /Stream #\d+:\d+[^\n]*Audio:/.test(r.stderr ?? "");
}

async function lengthOf(file: string): Promise<number> {
  const r = await runFfmpeg(["-i", file, "-t", "0", "-f", "null", "-"], 30_000).catch((e: { stderr?: string }) => ({ stderr: e?.stderr ?? "" }));
  const m = (r.stderr ?? "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

export async function renderDrama(owner: string, p: DramaProject, r: DramaRender): Promise<{ key: string; totalSec: number }> {
  const items = p.timeline
    .map((t) => ({ t, clip: p.clips.find((c) => c.id === t.clipId) }))
    .filter((x): x is { t: (typeof p.timeline)[number]; clip: NonNullable<(typeof x)["clip"]> } => Boolean(x.clip && x.clip.approved));
  if (!items.length) throw new Error("타임라인에 승인한 클립이 없습니다.");
  if (items.length > RENDER_LIMITS.maxClips) throw new Error(`클립은 최대 ${RENDER_LIMITS.maxClips}개입니다.`);
  const [W, H] = p.settings.aspect === "16:9" ? [1280, 720] : [720, 1280];
  const fade = p.renderSettings.transition === "fade";
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_render_"));
  try {
    const parts: string[] = [];
    let total = 0;
    for (const [i, { t, clip }] of items.entries()) {
      const buf = await videoStorage.download(clip.key);
      if (!buf) throw new Error(`${i + 1}번 클립 파일을 찾지 못했습니다.`);
      const src = path.join(dir, `src${i}.mp4`);
      await writeFile(src, buf);
      const full = (await lengthOf(src)) || clip.durationSec;
      const start = Math.max(0, Math.min(t.trimStart, full - 0.3));
      const dur = Math.max(0.3, full - start - Math.max(0, t.trimEnd));
      total += dur;
      if (total > RENDER_LIMITS.maxTotalSec) throw new Error(`전체 길이는 최대 ${RENDER_LIMITS.maxTotalSec / 60}분입니다.`);
      const audioIn = t.audio && (await hasAudio(src));
      const fd = Math.min(0.3, dur / 4);
      const vf = [`scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`, `fps=${FPS}`, "setsar=1", "format=yuv420p", ...(fade ? [`fade=t=in:st=0:d=${fd}`, `fade=t=out:st=${(dur - fd).toFixed(3)}:d=${fd}`] : [])].join(",");
      const af = ["aresample=44100", "aformat=channel_layouts=stereo", ...(fade ? [`afade=t=in:st=0:d=${fd}`, `afade=t=out:st=${(dur - fd).toFixed(3)}:d=${fd}`] : [])].join(",");
      const out = path.join(dir, `p${i}.mp4`);
      await runFfmpeg(
        [
          "-ss", start.toFixed(3), "-t", dur.toFixed(3), "-i", src,
          ...(audioIn ? [] : ["-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo"]),
          "-map", "0:v:0", "-map", audioIn ? "0:a:0" : "1:a:0",
          "-vf", vf, "-af", af,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "2M", "-bufsize", "4M", "-r", String(FPS),
          "-c:a", "aac", "-b:a", "128k", "-t", dur.toFixed(3), out,
        ],
        300_000,
      );
      parts.push(out);
    }
    const list = path.join(dir, "list.txt");
    await writeFile(list, parts.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    const joined = path.join(dir, "joined.mp4");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined], 300_000);
    let final = joined;
    const bgmKey = p.renderSettings.bgmKey;
    if (bgmKey) {
      const bgm = await videoStorage.download(bgmKey);
      if (bgm) {
        const bf = path.join(dir, `bgm${path.extname(bgmKey) || ".mp3"}`);
        await writeFile(bf, bgm);
        final = path.join(dir, "final.mp4");
        const vol = Math.min(1, Math.max(0, p.renderSettings.bgmVolume));
        await runFfmpeg(
          ["-i", joined, "-stream_loop", "-1", "-i", bf, "-filter_complex", `[1:a]volume=${vol},atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5[bg];[0:a][bg]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(3), final],
          300_000,
        );
      }
    }
    const done = path.join(dir, "done.mp4");
    const title = (p.renderSettings.title || p.title).replace(/[\r\n]/g, " ").slice(0, 80);
    await runFfmpeg(["-i", final, "-c", "copy", "-metadata", `title=${title}`, "-movflags", "+faststart", done], 120_000);
    const size = (await stat(done)).size;
    if (size > RENDER_LIMITS.maxBytes) throw new Error(`완성 파일이 너무 큽니다 (${Math.round(size / 1048576)}MB). 클립 수나 길이를 줄여 주세요.`);
    const key = `${projectDir(owner, p.id)}/render/r${r.version}_${r.id}.mp4`;
    await videoStorage.put(key, await readFile(done), "video/mp4");
    return { key, totalSec: Number(total.toFixed(2)) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
