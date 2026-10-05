import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { youtubeOutlierService } from "@/lib/server/services/youtube-outlier";

export const maxDuration = 60;

/** POST /api/trends/youtube/outliers { items: [{ videoId, channelId, views }] } — 아웃라이어 점수 (채널 최근 15개 중앙값 대비, 누를 때만) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    await rateLimit("youtube-outlier");
    return youtubeOutlierService.scores(await readJson(request));
  });
}
