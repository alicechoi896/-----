import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { youtubeChannelService } from "@/lib/server/services/youtube-channel";

/** GET /api/trends/youtube/channel?channelId= — 채널 정보 + 최근 6개월 영상·중앙값 배수 (누를 때만, 30분 기억, 약 3~9 units) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    await rateLimit("youtube-outlier");
    return youtubeChannelService.insight({ channelId: new URL(request.url).searchParams.get("channelId") });
  });
}
