/**
 * 영상 음성 제거 엔진 (브라우저 전용, ffmpeg.wasm). 샤오홍슈 다운로드(lib/xhs-download.ts)가 쓴다.
 * - 영상 스트림은 다시 인코딩하지 않고 그대로 복사(-c copy)하고 오디오만 뺀다(-an) → 빠르고 화질 손실이 없다
 * - 파일은 서버로 올라가지 않는다. 처리 엔진(약 30MB)은 처음 한 번 CDN 에서 받아 브라우저가 캐시한다
 * - 직접 촬영했거나 사용 허락을 받은 영상만 처리한다 (화면에 안내)
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
/** ffmpeg.wasm 은 파일 전체를 메모리에 올리므로 너무 큰 파일은 막는다 */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv";

let loading: Promise<FFmpeg> | null = null;

/** 엔진을 한 번만 불러온다 */
export function loadEngine(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (!loading) {
    loading = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
      const ffmpeg = new FFmpeg();
      if (onLog) ffmpeg.on("log", ({ message }) => onLog(message));
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((e) => {
      loading = null; // 실패하면 다음에 다시 시도할 수 있게
      throw e;
    });
  }
  return loading;
}

const extOf = (name: string) => (name.match(/\.([a-z0-9]{2,4})$/i)?.[1] ?? "mp4").toLowerCase();

export function mutedFileName(name: string): string {
  const ext = extOf(name);
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, "");
  return `${base}_음성제거.${ext === "m4v" ? "mp4" : ext}`;
}

/** 영상 1개에서 오디오를 뺀다. progress: 0~1 */
export async function removeAudio(file: File, onProgress?: (ratio: number) => void): Promise<Blob> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`${file.name}: 1GB 이하 영상만 처리할 수 있습니다.`);
  const ffmpeg = await loadEngine();
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
