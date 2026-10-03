import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { youtubeStatsService } from "@/lib/server/services/youtube-stats";

/** GET /api/publications/stats?ids= — YouTube 업로드의 현재 조회수·좋아요·댓글 (+ 내 콘텐츠면 1일·7일 기록) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("uploads");
    await rateLimit("trends-youtube");
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean);
    return youtubeStatsService.stats(ids);
  });
}
