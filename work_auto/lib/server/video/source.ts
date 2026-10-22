import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReferenceVideo } from "@/lib/types";
import { serverConfig } from "../config";
import { resolveXiaohongshuWithFallback } from "../providers/video/xhs-fallback";
import { safeFetch } from "../security/safe-url";
import { VIDEO_RENDER_CONFIG } from "@/lib/video-production/config";
import { mediaDuration, runFfmpeg } from "./ffmpeg";

/**
 * 원본 영상 받기 (v0.9.51) — 렌더할 때만 임시 폴더에 받고, 작업이 끝나면 지운다 (원본을 남기지 않는다).
 * - 샤오홍슈: 저장된 노트 주소 → 재생 주소 (샤오홍슈 페이지, 막히면 TikHub 상세 1회) → xhscdn 에서 받기
 * - 데모(PROVIDER_MODE≠live): 실제 영상 대신 색이 움직이는 시험 영상을 만든다
 * reference_videos 의 원본(주소)은 바꾸지 않는다.
 */
/** 영상 서버는 브라우저가 아닌 요청(기본 User-Agent)을 거절할 수 있다 (v0.9.59) */
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Referer: "https://www.xiaohongshu.com/",
  Accept: "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9,ko;q=0.8",
};

/** 받기 실패: resolve = 재생 주소를 못 받음, download = 주소는 받았지만 영상 서버가 거절 */
export class SourceError extends Error {
  constructor(
    public stage: "resolve" | "download" | "file",
    message: string,
  ) {
    super(message);
  }
}

export interface LocalSource {
  videoId: string;
  file: string;
  duration: number;
  title: string;
}

export async function fetchSource(video: ReferenceVideo, dir: string, index: number): Promise<LocalSource> {
  const file = path.join(dir, `src${index}.mp4`);
  if (serverConfig.providerMode !== "live") {
    // 데모: 10초 시험 영상 (색·움직임). 글자 없음
    const hue = (index * 67) % 360;
    await runFfmpeg(
      ["-f", "lavfi", "-i", `testsrc2=size=720x1280:rate=30:duration=10`, "-vf", `hue=h=${hue}`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file],
      60_000,
    );
    return { videoId: video.id, file, duration: 10, title: video.title };
  }
  const name = `'${video.title.slice(0, 20)}'`;
  if (video.platform !== "xiaohongshu") throw new SourceError("resolve", `${name} 는 샤오홍슈 영상이 아니라 자동 제작에 쓰지 못했습니다 (V1 은 샤오홍슈만).`);
  let resolved: Awaited<ReturnType<typeof resolveXiaohongshuWithFallback>>;
  try {
    resolved = await resolveXiaohongshuWithFallback(video.url);
  } catch (e) {
    throw new SourceError("resolve", `${name} 재생 주소를 받지 못했습니다 (${e instanceof Error ? e.message : String(e)})`);
  }
  const raw = resolved.streams.flatMap((s) => [s.url, ...s.backupUrls]).filter(Boolean);
  // https 가 안 되면 http 로도 (TikHub 주소는 http 로 오는 경우가 있다)
  const urls = [...new Set(raw.flatMap((u) => [u, u.replace(/^https:\/\//, "http://")]))];
  let lastError = "재생 주소가 없습니다";
  for (const u of urls.slice(0, 6)) {
    const t0 = Date.now();
    let host = "";
    try {
      host = new URL(u).hostname;
      // v0.9.63: 영상 서버 주소 제한 없음 (xhscdn·rednotecdn 등 — 저작권 확인된 영상). 내부망 주소는 safeFetch 가 막는다
      const res = await safeFetch(u, { signal: AbortSignal.timeout(60_000), headers: BROWSER_HEADERS });
      console.info("[VideoSource]", JSON.stringify({ videoId: video.id, host, scheme: u.slice(0, 5), status: res.status, len: res.headers.get("content-length"), type: res.headers.get("content-type"), ms: Date.now() - t0 }));
      if (!res.ok) {
        lastError = `영상 서버 HTTP ${res.status}`;
        continue;
      }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > VIDEO_RENDER_CONFIG.maxSourceBytes) throw new Error("원본 영상이 너무 큽니다 (80MB 초과).");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > VIDEO_RENDER_CONFIG.maxSourceBytes) throw new Error("원본 영상이 너무 큽니다 (80MB 초과).");
      await writeFile(file, buf);
      const duration = (await mediaDuration(file)) || resolved.durationSec || 0;
      if (duration < 1) throw new Error("영상 길이를 읽지 못했습니다.");
      return { videoId: video.id, file, duration, title: video.title };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("[VideoSource]", JSON.stringify({ videoId: video.id, host, error: lastError.slice(0, 200), ms: Date.now() - t0 }));
    }
  }
  throw new SourceError("download", `${name} 원본을 받지 못했습니다 (${lastError}).`);
}
