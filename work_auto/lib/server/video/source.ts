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
const ALLOWED_HOST = /(^|\.)xhscdn\.(com|net)$/i;

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
  if (video.platform !== "xiaohongshu") throw new Error(`'${video.title.slice(0, 20)}' 는 샤오홍슈 영상이 아니라 자동 제작에 쓰지 못했습니다 (V1 은 샤오홍슈만).`);
  const resolved = await resolveXiaohongshuWithFallback(video.url);
  const urls = resolved.streams.flatMap((s) => [s.url, ...s.backupUrls]);
  let lastError = "재생 주소가 없습니다";
  for (const u of urls.slice(0, 4)) {
    try {
      const host = new URL(u).hostname;
      if (!ALLOWED_HOST.test(host)) continue;
      const res = await safeFetch(u, { signal: AbortSignal.timeout(60_000), headers: { Referer: "https://www.xiaohongshu.com/" } });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
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
    }
  }
  throw new Error(`'${video.title.slice(0, 20)}' 원본을 받지 못했습니다 (${lastError}).`);
}
