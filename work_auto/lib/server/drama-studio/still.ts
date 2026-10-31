import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import { projectDir } from "./store";
import { newId, swapIntoTimeline } from "@/lib/drama-studio/steps";
import type { DramaClip, DramaProject } from "@/lib/drama-studio/types";

/**
 * v0.9.135 사진 + 움직임 클립 (무료): 승인한 스토리보드 이미지에 천천히 다가가거나 옆으로 흐르는 움직임을 넣은 mp4.
 * 대사 없는 장면(이동·분위기·풍경)에 쓰고, AI 영상은 대사·감정 장면에만 — 외부 호출 없음.
 */
export async function makeStillClips(owner: string, p: DramaProject, sceneIds: string[]): Promise<{ made: number; skipped: number }> {
  const [W, H] = p.settings.aspect === "9:16" ? [720, 1280] : [1280, 720];
  let made = 0;
  let skipped = 0;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_still_"));
  try {
    for (const id of sceneIds.slice(0, 30)) {
      const i = p.scenario.scenes.findIndex((s) => s.id === id);
      const scene = p.scenario.scenes[i];
      const img = (p.storyboard[id] ?? []).find((x) => x.approved && !x.removed);
      const buf = img ? await videoStorage.download(img.key).catch(() => null) : null;
      if (!scene || !buf) {
        skipped++;
        continue;
      }
      const sec = Math.min(10, Math.max(2, Math.round(scene.durationSec || 4)));
      const frames = sec * 30;
      const src = path.join(dir, `s${i}.img`);
      const out = path.join(dir, `s${i}.mp4`);
      await writeFile(src, buf);
      // 장면마다 움직임을 번갈아: 다가가기 · 왼쪽→오른쪽 · 물러나기
      const kind = i % 3;
      const z = kind === 2 ? `max(1.15-0.15*on/${frames},1.0)` : `min(1+0.12*on/${frames},1.12)`;
      const x = kind === 1 ? `(iw-iw/zoom)*on/${frames}` : "iw/2-(iw/zoom/2)";
      const zoom = kind === 1 ? "1.12" : z;
      await runFfmpeg(
        [
          "-loop", "1", "-i", src,
          "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
          "-filter_complex", `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${zoom}':x='${x}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,format=yuv420p[v]`,
          "-map", "[v]", "-map", "1:a", "-t", String(sec), "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-shortest", out,
        ],
        120_000,
      );
      const key = `${projectDir(owner, p.id)}/clip/still_${newId("st")}.mp4`;
      await videoStorage.put(key, await readFile(out), "video/mp4");
      const clip: DramaClip = { id: newId("cl"), sceneIds: [id], key, source: "ai", modelId: "still", mode: "still", prompt: "사진 + 움직임 (스토리보드 이미지)", durationSec: sec, createdAt: new Date().toISOString(), approved: true, taskId: null };
      p.clips.push(clip);
      swapIntoTimeline(p, clip);
      made++;
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  return { made, skipped };
}
