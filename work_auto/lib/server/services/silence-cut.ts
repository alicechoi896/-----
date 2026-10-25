import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SILENCE_DEFAULTS, SILENCE_LIMITS, SILENCE_OPTIONS, keepSegments, parseSilences, type SilenceCutResult } from "@/lib/silence-cut";
import { AppError } from "../http";
import { getActorId } from "../repositories";
import { runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";

/**
 * 무음 구간 자르기 (v0.9.70). docs/SILENCE_CUT.md
 * 1) [올릴 주소] 브라우저가 Supabase Storage(videos/{사용자}/silence/…)에 직접 올린다 (서버 요청 크기 제한을 피하려고)
 * 2) [자르기] 서버가 받아 FFmpeg silencedetect → 남길 구간만 이어 붙여 다시 인코딩 → 결과를 올리고 원본은 바로 지운다
 * 3) 결과는 다운로드 주소(1시간)로. 1시간 지난 파일은 다음에 쓸 때 정리한다. 외부 유료 API 없음
 */
const KEY = /^[\w-]{3,40}\/silence\/[\w-]{6,40}\.(mp4|mov|webm|m4v|mkv)$/i;
const KEEP_MS = 60 * 60 * 1000;

const pick = <T extends number>(list: readonly T[], v: unknown, d: T): T => (list.includes(Number(v) as T) ? (Number(v) as T) : d);

/** 길이 (영상 머리 정보만 읽어 빠르게) */
async function probeDuration(file: string): Promise<number> {
  // 출력 없이 -i 만 하면 FFmpeg 가 실패로 끝나 로그가 잘린다 → 0초만 버리는 출력으로
  const { stderr } = await runFfmpeg(["-i", file, "-t", "0", "-f", "null", "-"], 30_000).catch((e: Error) => ({ stderr: e.message }));
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
}

/** 1시간 지난 내 무음 자르기 파일 정리 */
async function cleanup(folder: string) {
  const files = await videoStorage.list(folder).catch(() => []);
  for (const f of files) {
    if (f.createdAt && Date.now() - Date.parse(f.createdAt) > KEEP_MS) await videoStorage.remove(f.key).catch(() => undefined);
  }
}

export const silenceCutService = {
  /** 올릴 주소 (브라우저가 바로 올린다) */
  async prepare(input: { fileName?: unknown; size?: unknown }): Promise<{ key: string; url: string; method: "PUT" | "POST" }> {
    const actor = await getActorId();
    const size = Number(input.size ?? 0);
    if (!size) throw new AppError("VALIDATION", "영상 파일을 골라 주세요.");
    if (size > SILENCE_LIMITS.maxBytes) throw new AppError("VALIDATION", `영상이 너무 큽니다 (최대 ${Math.round(SILENCE_LIMITS.maxBytes / 1024 / 1024)}MB).`);
    const ext = (String(input.fileName ?? "").match(/\.(mp4|mov|webm|m4v|mkv)$/i)?.[1] ?? "mp4").toLowerCase();
    await cleanup(`${actor}/silence`);
    const key = `${actor}/silence/${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}.${ext}`;
    return { key, ...(await videoStorage.signedUpload(key)) };
  },

  /** 데모(Supabase 없음)에서 우리 서버로 올리기 */
  async uploadMemory(key: string, body: ArrayBuffer): Promise<void> {
    const actor = await getActorId();
    if (!KEY.test(key) || !key.startsWith(`${actor}/`)) throw new AppError("VALIDATION", "올릴 위치가 올바르지 않습니다.");
    if (body.byteLength > SILENCE_LIMITS.maxBytes) throw new AppError("VALIDATION", "영상이 너무 큽니다.");
    await videoStorage.put(key, Buffer.from(body));
  },

  /** 무음 구간 자르기 → 결과 다운로드 주소 */
  async cut(input: { key?: unknown; minSilence?: unknown; noiseDb?: unknown; pad?: unknown; fileName?: unknown }): Promise<SilenceCutResult> {
    const actor = await getActorId();
    const key = String(input.key ?? "");
    if (!KEY.test(key) || !key.startsWith(`${actor}/`)) throw new AppError("VALIDATION", "올린 영상을 찾을 수 없습니다. 다시 올려 주세요.");
    const minSilence = pick(SILENCE_OPTIONS.minSilence, input.minSilence, SILENCE_DEFAULTS.minSilence);
    const noiseDb = pick(SILENCE_OPTIONS.noiseDb.map((x) => x.value), input.noiseDb, SILENCE_DEFAULTS.noiseDb);
    const pad = pick(SILENCE_OPTIONS.pad, input.pad, SILENCE_DEFAULTS.pad);
    const buf = await videoStorage.download(key);
    if (!buf) throw new AppError("NOT_FOUND", "올린 영상을 찾을 수 없습니다. 다시 올려 주세요.", 404);
    const dir = path.join(os.tmpdir(), `sc_${crypto.randomUUID().slice(0, 8)}`);
    await mkdir(dir, { recursive: true });
    const t0 = Date.now();
    try {
      const src = path.join(dir, `in${path.extname(key)}`);
      await writeFile(src, buf);
      await videoStorage.remove(key).catch(() => undefined); // 원본은 받자마자 지운다
      const duration = await probeDuration(src);
      if (!duration) throw new AppError("VALIDATION", "영상을 읽지 못했습니다. mp4·mov 영상인지 확인해 주세요.");
      if (duration > SILENCE_LIMITS.maxDurationSec) throw new AppError("VALIDATION", `영상이 너무 깁니다 (최대 ${SILENCE_LIMITS.maxDurationSec / 60}분).`);
      // 1) 무음 찾기 (소리만 읽어서 빠르게)
      const { stderr } = await runFfmpeg(["-i", src, "-vn", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSilence}`, "-f", "null", "-"], 120_000);
      if (/does not contain any stream|Output file #0 does not contain/i.test(stderr)) throw new AppError("VALIDATION", "소리가 없는 영상입니다.");
      const silences = parseSilences(stderr, duration);
      const keeps = keepSegments(silences, duration, pad);
      if (!keeps.length) throw new AppError("VALIDATION", "영상 전체가 무음입니다. 무음 기준을 '아주 조용할 때만'으로 바꿔 보세요.");
      const afterSec = keeps.reduce((n, [a, b]) => n + (b - a), 0);
      // 2) 남길 구간만 이어 붙이기 (영상·소리 함께, 다시 인코딩)
      const sel = keeps.map(([a, b]) => `between(t,${a},${b})`).join("+");
      const filterFile = path.join(dir, "filter.txt");
      await writeFile(filterFile, `[0:v]select='${sel}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${sel}',asetpts=N/SR/TB[a]`);
      const out = path.join(dir, "out.mp4");
      await runFfmpeg(
        ["-i", src, "-filter_complex_script", filterFile, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out],
        270_000,
        dir,
      );
      const outKey = key.replace(/\.[^.]+$/, "_cut.mp4");
      await videoStorage.put(outKey, await readFile(out));
      const base = String(input.fileName ?? "video").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 60) || "video";
      const fileName = `${base}_무음제거.mp4`;
      const url = await videoStorage.url(outKey, { seconds: 3600 });
      const downloadUrl = await videoStorage.url(outKey, { seconds: 3600, download: fileName });
      if (!url || !downloadUrl) throw new AppError("STORAGE", "결과 영상을 저장하지 못했습니다.", 500);
      console.info("[SilenceCut]", JSON.stringify({ before: Number(duration.toFixed(1)), after: Number(afterSec.toFixed(1)), cuts: silences.length, minSilence, noiseDb, pad, ms: Date.now() - t0 }));
      return { url, downloadUrl, fileName, beforeSec: Number(duration.toFixed(2)), afterSec: Number(afterSec.toFixed(2)), removedSec: Number((duration - afterSec).toFixed(2)), cuts: silences.length };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
