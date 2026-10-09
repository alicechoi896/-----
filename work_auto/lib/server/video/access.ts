import "server-only";
import type { VideoChannel } from "@/lib/types/video-production";
import { requireAccess } from "../auth";

/** 채널 → 기능 권한 (영상 자동 제작) */
export async function requireVideoAccess(channel: unknown): Promise<VideoChannel> {
  const ch: VideoChannel = channel === "naver-clip" ? "naver-clip" : "youtube";
  await requireAccess(ch === "youtube" ? "yt-video-production" : "clip-video-production");
  return ch;
}
