import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * FFmpeg 실행 (v0.9.51). ffmpeg-static 의 실행 파일을 쓴다 (Vercel: 리눅스 바이너리를 함수에 포함, next.config outputFileTracingIncludes).
 * - 명령은 항상 인자 배열로 넘긴다 (셸을 거치지 않음 → 명령 주입 불가). 자막·제목 글자는 파일(textfile=)로 넘긴다.
 * - 오류 메시지에는 FFmpeg 로그 마지막 몇 줄만 남기고 화면에는 보이지 않는다.
 */
let cached: string | null = null;

export function ffmpegPath(): string {
  if (cached) return cached;
  const candidates: string[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p) candidates.push(p);
  } catch {
    /* 없으면 아래 경로 */
  }
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  candidates.push(path.join(process.cwd(), "node_modules", "ffmpeg-static", bin));
  const found = candidates.find((c) => existsSync(c));
  if (!found) throw new Error("FFMPEG_MISSING");
  cached = found;
  return found;
}

export interface FfmpegResult {
  stderr: string;
}

/** ffmpeg 실행. timeoutMs 를 넘기면 중단 */
export function runFfmpeg(args: string[], timeoutMs = 120_000, cwd?: string): Promise<FfmpegResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"], cwd });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg 실패 (${code}): ${stderr.split("\n").slice(-6).join(" | ").slice(0, 600)}`));
    });
  });
}

/** 영상·음성 길이(초) — ffprobe 없이 ffmpeg 출력에서 읽는다 */
export async function mediaDuration(file: string): Promise<number> {
  const { stderr } = await runFfmpeg(["-i", file, "-f", "null", "-"], 60_000).catch((e: Error) => ({ stderr: e.message }));
  const all = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const last = all.at(-1);
  if (last) return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
  const d = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
}

/** 영상 크기 */
export async function videoSize(file: string): Promise<{ width: number; height: number }> {
  const { stderr } = await runFfmpeg(["-i", file], 30_000).catch((e: Error) => ({ stderr: e.message }));
  const m = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 0, height: 0 };
}

/** filter 값 안의 특수문자 이스케이프 (경로 등) */
export const escFilterPath = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
