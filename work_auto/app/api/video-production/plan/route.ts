import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** POST /api/video-production/plan { contentId, scriptIndex, channelId, sourceMode, videoIds, voice } — 컷 계획 (AI 1회: 화면용 제목) */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<Record<string, unknown>>(request);
    await requireVideoAccess(body.channelId);
    await rateLimit("ai-generate");
    return videoJobService.plan(body);
  });
}
