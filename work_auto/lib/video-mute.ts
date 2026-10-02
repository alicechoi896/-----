/**
 * 영상 음성 제거 엔진 (브라우저 전용, ffmpeg.wasm). 샤오홍슈 다운로드(lib/xhs-download.ts)가 쓴다.
 * - 영상 스트림은 다시 인코딩하지 않고 그대로 복사(-c copy)하고 오디오만 뺀다(-an) → 빠르고 화질 손실이 없다
 * - 파일은 서버로 올라가지 않는다. 처리 엔진(약 30MB)은 처음 한 번 CDN 에서 받아 브라우저가 캐시한다
 * - 직접 촬영했거나 사용 허락을 받은 영상만 처리한다 (화면에 안내)
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";

/** 엔진 파일 위치: 첫 번째가 안 되면 다음 CDN 에서 받는다 (한 CDN 장애로 모든 사용자가 멈추지 않게) */
const CORE_BASES = [
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd",
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd",
];
/** ffmpeg.wasm 은 파일 전체를 메모리에 올리므로 너무 큰 파일은 막는다 */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv";

/** 엔진 파일(약 30MB)은 한 번만 받아 두고 다시 쓴다 */
let coreUrls: Promise<{ coreURL: string; wasmURL: string }> | null = null;

function engineFiles() {
  if (!coreUrls) {
    coreUrls = (async () => {
      const { toBlobURL } = await import("@ffmpeg/util");
      let lastError: unknown = null;
      for (const base of CORE_BASES) {
        try {
          return {
            coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
            wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
          };
        } catch (e) {
          lastError = e;
        }
      }
      throw new Error(`영상 처리 엔진을 받지 못했습니다. 인터넷 연결을 확인해 주세요. (${lastError instanceof Error ? lastError.message : "CDN 오류"})`);
    })().catch((e) => {
      coreUrls = null; // 실패하면 다음에 다시 받는다
      throw e;
    });
  }
  return coreUrls;
}

/** 엔진 파일을 미리 받아 둔다 (화면에 "준비 중"을 보여 줄 때) */
export async function preloadEngine(): Promise<void> {
  await engineFiles();
}

/**
 * 엔진 작업은 한 번에 하나씩, 작업마다 새 엔진으로 한다.
 * - ffmpeg.wasm(core 0.12.10)은 같은 엔진에서 명령을 두 번째 실행하면 인자 처리가 망가져
 *   "Unrecognized option 'y'" → Aborted / memory access out of bounds 로 멈춘다 (2026-10 확인)
 * - 명령 두 개가 동시에 돌아도 같은 문제가 생기므로 줄을 세운다
 * 새 엔진을 띄우는 데 1초 안팎이 더 든다 (엔진 파일은 메모리에 있어 다시 받지 않는다).
 */
let queue: Promise<unknown> = Promise.resolve();
export function runExclusive<T>(job: (ffmpeg: FFmpeg) => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const [{ FFmpeg }, urls] = await Promise.all([import("@ffmpeg/ffmpeg"), engineFiles()]);
    const ffmpeg = new FFmpeg();
    await ffmpeg.load(urls);
    try {
      return await job(ffmpeg);
    } finally {
      ffmpeg.terminate();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

const extOf = (name: string) => (name.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "mp4").toLowerCase();

export function mutedFileName(name: string): string {
  const ext = extOf(name);
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, "");
  return `${base}_음성제거.${ext === "m4v" ? "mp4" : ext}`;
}

/** 영상 1개에서 오디오를 뺀다. progress: 0~1 */
export async function removeAudio(file: File, onProgress?: (ratio: number) => void, opts: { hevc?: boolean } = {}): Promise<Blob> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: 1GB 이하 영상만 처리할 수 있습니다.`);
  return runExclusive((ffmpeg) => removeAudioWith(ffmpeg, file, onProgress, opts));
}

async function removeAudioWith(
  ffmpeg: FFmpeg,
  file: File,
  onProgress?: (ratio: number) => void,
  opts: { hevc?: boolean } = {},
): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const ext = extOf(file.name);
  const outExt = ext === "m4v" ? "mp4" : ext;
  const input = `input.${ext}`;
  const output = `output.${outExt}`;
  const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
  ffmpeg.on("progress", handler);
  try {
    await ffmpeg.writeFile(input, await fetchFile(file));
    const args = ["-i", input, "-map", "0:v", "-c", "copy", "-an"];
    if (outExt === "mp4" || outExt === "mov") args.push("-movflags", "+faststart");
    // H.265 는 hvc1 표시가 있어야 Mac·iPhone(QuickTime)에서도 열린다
    if (opts.hevc && (outExt === "mp4" || outExt === "mov")) args.push("-tag:v", "hvc1");
    const code = await ffmpeg.exec([...args, output]);
    if (code !== 0) throw new Error(`${file.name}: 처리하지 못했습니다. 손상되었거나 지원하지 않는 형식일 수 있습니다.`);
    const data = await ffmpeg.readFile(output);
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    return new Blob([bytes], { type: file.type || (outExt === "webm" ? "video/webm" : "video/mp4") });
  } finally {
    ffmpeg.off("progress", handler);
    await ffmpeg.deleteFile(input).catch(() => undefined);
    await ffmpeg.deleteFile(output).catch(() => undefined);
  }
}
