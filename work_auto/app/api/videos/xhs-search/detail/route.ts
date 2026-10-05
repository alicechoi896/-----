import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { xhsSearchService } from "@/lib/server/services/xhs-search";

/** GET /api/videos/xhs-search/detail?noteId= — [상세보기]를 누를 때만 (TikHub 1회, 1시간 기억) */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("xhs-search");
    return xhsSearchService.detail(request.nextUrl.searchParams.get("noteId") ?? "");
  });
}
