import { handle } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** GET /api/video-production/typecast-voices?channelId= — 타입캐스트 목소리 목록 (무료, 1시간 기억) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireVideoAccess(new URL(request.url).searchParams.get("channelId"));
    return videoJobService.typecastVoices();
  });
}
