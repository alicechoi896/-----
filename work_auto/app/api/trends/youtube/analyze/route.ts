import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { youtubeInsightService } from "@/lib/server/services/youtube-insights";
import type { YouTubeTrendItem } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/trends/youtube/analyze { video } — 잘된 이유 + 추천 제목 (AI) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    const { video } = await readJson<{ video: Partial<YouTubeTrendItem> }>(request);
    return youtubeInsightService.analyzeVideo(video);
  });
}
