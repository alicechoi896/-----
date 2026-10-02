import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { trendService } from "@/lib/server/services/trends";

/** GET /api/trends/youtube?category&keyword&period&format&sort */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess("yt-trends");
    return trendService.searchYouTube(request.nextUrl.searchParams);
  });
}
