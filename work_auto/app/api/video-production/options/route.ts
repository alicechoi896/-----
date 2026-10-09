import { handle } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** GET /api/video-production/options?channelId= — 고를 수 있는 대본·영상 소재·자료 상태 (외부 호출 0) */
export async function GET(request: Request) {
  return handle(async () => {
    const ch = await requireVideoAccess(new URL(request.url).searchParams.get("channelId"));
    return videoJobService.options(ch);
  });
}
