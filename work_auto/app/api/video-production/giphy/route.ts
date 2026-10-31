import { handle } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** GET /api/video-production/giphy?q=&type=stickers|gifs&channelId= — GIPHY 검색 (버튼 1번 = 1회, 무료) */
export async function GET(request: Request) {
  return handle(async () => {
    const sp = new URL(request.url).searchParams;
    await requireVideoAccess(sp.get("channelId"));
    return videoJobService.giphySearch(sp.get("q") ?? "", sp.get("type") ?? "stickers");
  });
}
