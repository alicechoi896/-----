/**
 * 영상 글자 자동 흐리게 (브라우저 + AI 위치 찾기).
 *  1) 영상에서 1초 안팎 간격으로 화면을 뽑는다 (ffmpeg.wasm, 원시 화소 → 캔버스 → 작은 JPEG)
 *  2) AI(Vision)가 화면마다 "영상 위에 덧씌운 글자"(자막, 작성자 이름·아이디, 워터마크, 글자 로고) 위치를 찾는다
 *     — 제품 포장·간판처럼 장면 속에 원래 있는 글자는 그대로 둔다
 *  3) 이어지는 화면의 같은 위치를 하나로 묶어 "나오는 동안만" 흐리게 처리하고, 소리를 빼서 H.264 mp4 로 저장
 * 원작자에게 사용과 로고·자막 제거 허락을 받은 영상에만 쓴다 (버튼을 누를 때 확인한다).
 * 영상은 서버로 올라가지 않는다. 서버(AI)에는 작은 화면 이미지만 간다.
 *
 * ffmpeg.wasm(core 0.12.10) 주의 (2026-10 확인):
 *  - 한 엔진에서 명령을 두 번 실행하면 멈춘다 → 작업마다 새 엔진 (lib/video-mute.ts runExclusive)
 *  - JPEG·PNG 파일 출력(image2)·파이프 출력(-)·출력 없는 명령은 엔진을 멈추게 한다 → 원시 화소(rawvideo)로 받는다
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { runExclusive } from "@/lib/video-mute";

/** 흐리게 할 영역 (영상 원본 픽셀 기준), 나오는 구간(초) */
export interface BlurBox {
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
}

/** AI 가 찾은 글자 위치 (0~1000 정규화) */
export interface DetectedBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const toBytes = (data: Uint8Array | string) => (typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data));

/** 상자를 영상 안으로 맞춘다 (흐리기는 짝수 크기가 안전하다) */
function clampBox(b: BlurBox, width: number, height: number): BlurBox {
  const x = Math.min(Math.max(0, Math.round(b.x)), width - 4);
  const y = Math.min(Math.max(0, Math.round(b.y)), height - 4);
  const maxW = width - x - ((width - x) % 2);
  const maxH = height - y - ((height - y) % 2);
  return { ...b, x, y, w: Math.max(4, Math.min(even(b.w), maxW)), h: Math.max(4, Math.min(even(b.h), maxH)) };
}

/** 필터 그래프: 상자마다 잘라서 강하게 흐린 뒤 그 구간에만 다시 얹는다 → [vout] */
export function buildBlurFilter(boxes: BlurBox[], width: number, height: number): string {
  const parts: string[] = [];
  let cur = "0:v";
  boxes.forEach((raw, i) => {
    const b = clampBox(raw, width, height);
    // 색 정보(크로마)는 해상도가 절반이라 반경이 상자 짧은 변의 1/4 보다 작아야 한다 (넘으면 ffmpeg 가 거부)
    const radius = Math.max(1, Math.min(24, Math.floor(Math.min(b.w, b.h) / 4) - 1));
    parts.push(`[${cur}]split=2[base${i}][tmp${i}]`);
    parts.push(`[tmp${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},boxblur=${radius}:4[blur${i}]`);
    parts.push(`[base${i}][blur${i}]overlay=${b.x}:${b.y}:enable='between(t,${b.start.toFixed(2)},${b.end.toFixed(2)})'[v${i}]`);
    cur = `v${i}`;
  });
  parts.push(`[${cur}]format=yuv420p[vout]`);
  return parts.join(";");
}

/* ───────── 1) 화면 뽑기 ───────── */

/** 분석용 화면 가로 크기 (작게 보내야 AI 비용이 적다) */
const SAMPLE_W = 360;
/** 화면 수 상한 (긴 영상은 간격을 넓힌다) */
const MAX_SAMPLES = 30;

export interface Sampled {
  duration: number;
  width: number;
  height: number;
  /** t: 초, data: JPEG base64 */
  frames: { t: number; data: string }[];
}

function rawFrameToJpeg(bytes: Uint8Array, offset: number, w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const pixels = new Uint8ClampedArray(w * h * 4);
  pixels.set(bytes.subarray(offset, offset + w * h * 4));
  canvas.getContext("2d")!.putImageData(new ImageData(pixels, w, h), 0, 0);
  const url = canvas.toDataURL("image/jpeg", 0.7);
  return url.slice(url.indexOf(",") + 1);
}

/** 영상 → 길이·크기 + 일정 간격 화면들 (명령 두 번 = 엔진 두 번) */
export async function sampleFrames(source: Blob): Promise<Sampled> {
  const { fetchFile } = await import("@ffmpeg/util");
  const bytes = await fetchFile(source);

  // 1) 길이·크기 (아주 작은 첫 화면 1장을 원시 화소로 만들면서 남는 로그로 읽는다)
  const probe = await runExclusive(async (ffmpeg) => {
    const logs: string[] = [];
    const onLog = ({ message }: { message: string }) => logs.push(message);
    ffmpeg.on("log", onLog);
    await ffmpeg.writeFile("in.mp4", bytes.slice());
    await ffmpeg.exec(["-hide_banner", "-i", "in.mp4", "-frames:v", "1", "-vf", "scale=16:-2", "-f", "rawvideo", "-pix_fmt", "rgba", "p.raw"]);
    ffmpeg.off("log", onLog);
    return logs.join("\n");
  });
  const d = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const sizeMatch = probe.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  let width = sizeMatch ? Number(sizeMatch[1]) : 0;
  let height = sizeMatch ? Number(sizeMatch[2]) : 0;
  if (/rotat(e|ion)\D{0,20}(-?90|270)/i.test(probe)) [width, height] = [height, width];
  if (!duration || !width || !height) throw new Error("영상 정보를 읽지 못했습니다.");

  // 2) 간격: 1초, 길면 넓힌다 (최대 30장)
  const step = Math.max(1, duration / MAX_SAMPLES);
  const PW = SAMPLE_W;
  const PH = Math.max(2, Math.round((height * PW) / width / 2) * 2);
  const raw = await runExclusive(async (ffmpeg) => {
    await ffmpeg.writeFile("in.mp4", bytes.slice());
    const code = await ffmpeg.exec(["-i", "in.mp4", "-vf", `fps=1/${step.toFixed(3)},scale=${PW}:${PH}`, "-f", "rawvideo", "-pix_fmt", "rgba", "s.raw"]);
    if (code !== 0) throw new Error("화면을 뽑지 못했습니다.");
    return toBytes(await ffmpeg.readFile("s.raw"));
  });
  const frameSize = PW * PH * 4;
  const count = Math.min(Math.floor(raw.length / frameSize), MAX_SAMPLES);
  const frames = Array.from({ length: count }, (_, i) => ({
    t: Math.min(duration, (i + 0.5) * step),
    data: rawFrameToJpeg(raw, i * frameSize, PW, PH),
  }));
  return { duration, width, height, frames };
}

/* ───────── 2) 찾은 위치 → 흐리게 할 구간 ───────── */

const iou = (a: DetectedBox, b: DetectedBox) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter || 1);
};

/**
 * 화면별 위치(0~1000) → 흐리게 할 상자·구간 (원본 픽셀).
 * 이어지는 화면에서 겹치는 위치는 하나로 묶고, 앞뒤로 간격의 절반+여유만큼 늘린다 (자막이 바뀌는 순간을 놓치지 않게).
 */
export function toBlurBoxes(perFrame: { t: number; boxes: DetectedBox[] }[], width: number, height: number, duration: number): BlurBox[] {
  const step = perFrame.length > 1 ? perFrame[1].t - perFrame[0].t : 1;
  type Track = { box: DetectedBox; start: number; end: number; lastIndex: number };
  const tracks: Track[] = [];
  perFrame.forEach((f, i) => {
    for (const b of f.boxes) {
      if (b.w < 5 || b.h < 5) continue;
      const hit = tracks.find((tr) => tr.lastIndex >= i - 1 && iou(tr.box, b) > 0.25);
      if (hit) {
        const x = Math.min(hit.box.x, b.x);
        const y = Math.min(hit.box.y, b.y);
        hit.box = { x, y, w: Math.max(hit.box.x + hit.box.w, b.x + b.w) - x, h: Math.max(hit.box.y + hit.box.h, b.y + b.h) - y };
        hit.end = f.t;
        hit.lastIndex = i;
      } else {
        tracks.push({ box: { ...b }, start: f.t, end: f.t, lastIndex: i });
      }
    }
  });
  const pad = step / 2 + 0.3;
  return tracks.slice(0, 40).map((tr) => {
    // 글자 가장자리까지 덮도록 상자를 조금 키운다
    const px = (tr.box.w * 0.02 + 6) * (width / 1000);
    const py = (tr.box.h * 0.25 + 6) * (height / 1000);
    return {
      x: (tr.box.x * width) / 1000 - px,
      y: (tr.box.y * height) / 1000 - py,
      w: (tr.box.w * width) / 1000 + px * 2,
      h: (tr.box.h * height) / 1000 + py * 2,
      start: Math.max(0, tr.start - pad),
      end: Math.min(duration, tr.end + pad),
    };
  });
}

/* ───────── 3) 흐리게 + 소리 제거 → H.264 ───────── */

export async function blurAndMute(
  source: Blob,
  boxes: BlurBox[],
  size: { width: number; height: number },
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const { fetchFile } = await import("@ffmpeg/util");
  const bytes = await fetchFile(source);
  return runExclusive(async (ffmpeg: FFmpeg) => {
    await ffmpeg.writeFile("in.mp4", bytes);
    const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
    ffmpeg.on("progress", handler);
    const lines: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      lines.push(message);
      if (lines.length > 40) lines.shift();
    };
    ffmpeg.on("log", onLog);
    try {
      const code = await ffmpeg.exec([
        "-i",
        "in.mp4",
        "-filter_complex",
        buildBlurFilter(boxes, size.width, size.height),
        "-map",
        "[vout]",
        "-an", // 소리 제거
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        "out.mp4",
      ]);
      if (code !== 0) {
        const why = lines.filter((l) => /error|invalid|fail/i.test(l)).slice(-2).join(" / ");
        throw new Error(`영상을 처리하지 못했습니다.${why ? ` (${why})` : ""}`);
      }
      return new Blob([toBytes(await ffmpeg.readFile("out.mp4")) as BlobPart], { type: "video/mp4" });
    } finally {
      ffmpeg.off("progress", handler);
      ffmpeg.off("log", onLog);
    }
  });
}
