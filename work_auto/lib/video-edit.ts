/**
 * 영상 편집 (브라우저 전용, ffmpeg.wasm): 로고·자막 영역 처리 + 소리 제거.
 * - 원작자에게 로고·자막 제거 허락을 받은 영상에만 쓴다 (화면에서 확인 체크를 받는다)
 * - 영상은 서버로 올라가지 않는다. 화면을 다시 만들어야 해서(재인코딩) 길이에 비례해 시간이 걸린다
 * - 미리보기 프레임도 ffmpeg 로 뽑는다 → 브라우저가 재생 못 하는 H.265 영상도 편집할 수 있다
 *
 * 처리 방식
 *  - erase(지우기): ffmpeg delogo — 상자 테두리 주변 색으로 안쪽을 메운다. 작은 로고·워터마크에 알맞다
 *  - blur(흐리게): 상자 부분만 잘라 강하게 흐린 뒤 다시 얹는다. 넓은 자막 줄에 알맞다
 *  - cover(가리기): 색으로 채운다. 그 위에 내 자막을 넣을 때 알맞다
 */
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { runExclusive } from "@/lib/video-mute";

export type EditMode = "erase" | "blur" | "cover";

export interface EditBox {
  id: string;
  /** 영상 원본 픽셀 기준 */
  x: number;
  y: number;
  w: number;
  h: number;
  mode: EditMode;
  /** 적용 구간(초). 비우면 영상 전체 */
  start?: number | null;
  end?: number | null;
  /** cover 색 (#rrggbb) */
  color?: string;
}

export const MODE_LABEL: Record<EditMode, string> = { erase: "지우기", blur: "흐리게", cover: "가리기" };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** 상자를 영상 안으로 맞춘다 (delogo 는 테두리에 닿으면 안 되고, 흐리기는 짝수 크기가 안전하다) */
function clampBox(b: EditBox, width: number, height: number): EditBox {
  const x = Math.min(Math.max(1, Math.round(b.x)), width - 4);
  const y = Math.min(Math.max(1, Math.round(b.y)), height - 4);
  const w = Math.max(2, Math.min(Math.round(b.w), width - x - 1));
  const h = Math.max(2, Math.min(Math.round(b.h), height - y - 1));
  return { ...b, x, y, w, h };
}

function enableExpr(b: EditBox): string {
  const s = b.start ?? null;
  const e = b.end ?? null;
  if (s == null && e == null) return "";
  return `:enable='between(t,${(s ?? 0).toFixed(2)},${(e ?? 1e6).toFixed(2)})'`;
}

/** 필터 그래프 만들기: [0:v] → 상자 차례로 → [vout] */
export function buildFilter(boxes: EditBox[], width: number, height: number): string {
  const parts: string[] = [];
  let cur = "0:v";
  boxes.forEach((raw, i) => {
    const b = clampBox(raw, width, height);
    const out = `v${i}`;
    if (b.mode === "erase") {
      parts.push(`[${cur}]delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}${enableExpr(b)}[${out}]`);
    } else if (b.mode === "cover") {
      const color = (b.color ?? "#000000").replace("#", "0x");
      parts.push(`[${cur}]drawbox=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}:color=${color}@1:t=fill${enableExpr(b)}[${out}]`);
    } else {
      const w = even(b.w);
      const h = even(b.h);
      const radius = Math.max(2, Math.min(20, Math.floor(Math.min(w, h) / 2) - 1));
      parts.push(`[${cur}]split=2[base${i}][tmp${i}]`);
      parts.push(`[tmp${i}]crop=${w}:${h}:${b.x}:${b.y},boxblur=${radius}:3[blur${i}]`);
      parts.push(`[base${i}][blur${i}]overlay=${b.x}:${b.y}${enableExpr(b)}[${out}]`);
    }
    cur = out;
  });
  // 마지막에 H.264 호환 픽셀 형식
  parts.push(`[${cur}]format=yuv420p[vout]`);
  return parts.join(";");
}

const toBytes = (data: Uint8Array | string) => (typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data));

/**
 * 편집 세션: 영상을 엔진에 한 번 올려 두고 미리보기 프레임 뽑기·내보내기를 여러 번 한다.
 * 다 쓰면 close() 로 메모리를 비운다.
 */
export interface EditSession {
  duration: number;
  width: number;
  height: number;
  /** t 초의 화면 (JPEG object URL) */
  frameAt: (t: number) => Promise<string>;
  /** t 초 화면에 상자 처리를 적용한 결과 (내보내기 전에 확인용) */
  previewAt: (t: number, boxes: EditBox[]) => Promise<string>;
  /** 로고·자막 처리 + 소리 제거 → H.264 mp4 */
  exportVideo: (boxes: EditBox[], onProgress?: (ratio: number) => void) => Promise<Blob>;
  close: () => Promise<void>;
}

/** 엔진 로그에서 오류 줄만 골라 안내에 붙인다 */
async function execOrFail(ffmpeg: FFmpeg, args: string[], what: string): Promise<void> {
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    lines.push(message);
    if (lines.length > 40) lines.shift();
  };
  ffmpeg.on("log", onLog);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      const why = lines
        .filter((l) => /error|invalid|unknown|not found|fail/i.test(l))
        .slice(-2)
        .join(" / ");
      throw new Error(`${what}${why ? ` (${why})` : ""}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

/**
 * 편집 세션: 원본 영상을 메모리에 두고, 미리보기·내보내기를 할 때마다 새 엔진에 올려 처리한다
 * (ffmpeg.wasm 은 한 엔진에서 명령을 두 번 실행하면 멈추기 때문 — lib/video-mute.ts runExclusive).
 */
/** 미리보기 화면 가로 크기 (작을수록 빠르다) */
const PREVIEW_W = 540;

/** RGBA 원시 화소 → PNG object URL (브라우저 캔버스로 그린다) */
async function rawToUrl(data: Uint8Array | string, w: number, h: number): Promise<string> {
  const bytes = toBytes(data);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, w * h * 4), w, h), 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("화면을 그리지 못했습니다.");
  return URL.createObjectURL(blob);
}

/**
 * 편집 세션: 원본 영상을 메모리에 두고, 미리보기·내보내기를 할 때마다 새 엔진에 올려 처리한다.
 * 주의 (ffmpeg.wasm core 0.12.10, 2026-10 확인):
 *  - 한 엔진에서 명령을 두 번 실행하면 멈춘다 → 작업마다 새 엔진 (lib/video-mute.ts runExclusive)
 *  - JPEG·PNG 파일 출력(image2)과 파이프 출력(-), 출력 없는 명령은 엔진을 멈추게 한다
 *    → 미리보기 화면은 원시 화소(rawvideo, RGBA)로 받아 브라우저 캔버스로 그린다
 */
export async function openEditSession(source: Blob): Promise<EditSession> {
  const { fetchFile } = await import("@ffmpeg/util");
  const bytes = await fetchFile(source);
  const INPUT = "in.mp4";
  // writeFile 은 버퍼를 엔진으로 넘겨 버리므로(transfer) 매번 복사본을 쓴다
  const load = (ffmpeg: FFmpeg) => ffmpeg.writeFile(INPUT, bytes.slice());

  // 1) 길이·크기: 입력을 읽을 때 남는 로그에서 찾는다 (ffprobe 가 없다). 첫 화면도 같이 만든다
  const probe = await runExclusive(async (ffmpeg) => {
    const logs: string[] = [];
    const onLog = ({ message }: { message: string }) => logs.push(message);
    ffmpeg.on("log", onLog);
    await load(ffmpeg);
    // 크기를 아직 모르니 가로 PREVIEW_W, 세로는 비율대로(짝수) 줄여 원시 화소로 받는다
    const code = await ffmpeg.exec(["-hide_banner", "-i", INPUT, "-frames:v", "1", "-vf", `scale=${PREVIEW_W}:-2`, "-f", "rawvideo", "-pix_fmt", "rgba", "first.raw"]);
    ffmpeg.off("log", onLog);
    const first = code === 0 ? await ffmpeg.readFile("first.raw") : null;
    return { text: logs.join("\n"), first };
  });
  const d = probe.text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  const sizeMatch = probe.text.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const rotate = /rotat(e|ion)\D{0,20}(-?90|270)/i.test(probe.text);
  let width = sizeMatch ? Number(sizeMatch[1]) : 0;
  let height = sizeMatch ? Number(sizeMatch[2]) : 0;
  if (rotate) [width, height] = [height, width];
  if (!width || !height || !probe.first) throw new Error("영상 정보를 읽지 못했습니다. MP4·MOV 영상인지 확인해 주세요.");

  // 미리보기 크기 (scale=PREVIEW_W:-2 와 같은 계산)
  const PW = PREVIEW_W;
  const PH = Math.max(2, Math.round((height * PW) / width / 2) * 2);
  const raw = toBytes(probe.first);
  if (raw.length < PW * PH * 4) throw new Error("영상 화면을 읽지 못했습니다.");

  let lastUrl: string | null = null;
  const show = async (data: Uint8Array | string) => {
    const url = await rawToUrl(data, PW, PH);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = url;
    return url;
  };
  await show(raw);
  const firstUrl = lastUrl!;
  const clampT = (t: number) => Math.max(0, Math.min(t, Math.max(0, duration - 0.05))).toFixed(2);
  const RAW_OUT = ["-f", "rawvideo", "-pix_fmt", "rgba"];

  return {
    duration,
    width,
    height,
    frameAt: (t: number) =>
      t <= 0.01 && lastUrl === firstUrl
        ? Promise.resolve(firstUrl)
        : runExclusive(async (ffmpeg) => {
            await load(ffmpeg);
            await execOrFail(
              ffmpeg,
              ["-ss", clampT(t), "-i", INPUT, "-frames:v", "1", "-vf", `scale=${PW}:${PH}`, ...RAW_OUT, "f.raw"],
              "화면을 불러오지 못했습니다",
            );
            return show(await ffmpeg.readFile("f.raw"));
          }),
    previewAt: (t: number, boxes: EditBox[]) =>
      runExclusive(async (ffmpeg) => {
        await load(ffmpeg);
        // 구간 조건(enable)이 원래 시각으로 계산되도록 -ss 를 입력 뒤에 둔다
        const graph = buildFilter(boxes, width, height).replace("[vout]", "[full]") + `;[full]scale=${PW}:${PH}[vout]`;
        await execOrFail(
          ffmpeg,
          ["-i", INPUT, "-ss", clampT(t), "-filter_complex", graph, "-map", "[vout]", "-frames:v", "1", ...RAW_OUT, "p.raw"],
          "미리보기를 만들지 못했습니다",
        );
        return show(await ffmpeg.readFile("p.raw"));
      }),
    exportVideo: (boxes: EditBox[], onProgress?: (ratio: number) => void) =>
      runExclusive(async (ffmpeg) => {
        await load(ffmpeg);
        const handler = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)));
        ffmpeg.on("progress", handler);
        try {
          await execOrFail(
            ffmpeg,
            [
              "-i",
              INPUT,
              "-filter_complex",
              buildFilter(boxes, width, height),
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
            ],
            "영상을 처리하지 못했습니다. 상자 위치를 바꾸거나 다른 영상으로 시도해 주세요",
          );
          return new Blob([toBytes(await ffmpeg.readFile("out.mp4")) as BlobPart], { type: "video/mp4" });
        } finally {
          ffmpeg.off("progress", handler);
        }
      }),
    close: async () => {
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    },
  };
}
