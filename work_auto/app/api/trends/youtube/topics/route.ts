import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { youtubeInsightService } from "@/lib/server/services/youtube-insights";
import type { YouTubeTrendItem } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/trends/youtube/topics { videos, keywords } — 추천 주제 (AI) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    return youtubeInsightService.suggestTopics(await readJson<{ videos: Partial<YouTubeTrendItem>[]; keywords: string[] }>(request));
  });
}
