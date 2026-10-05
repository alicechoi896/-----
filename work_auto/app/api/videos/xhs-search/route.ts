import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { xhsSearchService } from "@/lib/server/services/xhs-search";

export const maxDuration = 60;

/** POST /api/videos/xhs-search { keyword, sort, period, cursor? } — 샤오홍슈 영상 검색 (TikHub, 저장하지 않음) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("xhs-search");
    return xhsSearchService.search(await readJson(request));
  });
}
