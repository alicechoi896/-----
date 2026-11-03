import { handle } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** GET /api/video-production/options?channelId=&contentId= — 고를 수 있는 대본·영상 소재·자료 상태 (외부 호출 0). contentId 는 링크로 연 원고 (목록 밖이어도 넣는다) */
export async function GET(request: Request) {
  return handle(async () => {
    const sp = new URL(request.url).searchParams;
    const ch = await requireVideoAccess(sp.get("channelId"));
    return videoJobService.options(ch, sp.get("contentId")?.slice(0, 80) ?? null);
  });
}
