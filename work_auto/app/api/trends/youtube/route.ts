import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { trendService } from "@/lib/server/services/trends";

/** GET /api/trends/youtube?category&keyword&period&format&sort */
export async function GET(request: NextRequest) {
  return handle(() => trendService.searchYouTube(request.nextUrl.searchParams));
}
