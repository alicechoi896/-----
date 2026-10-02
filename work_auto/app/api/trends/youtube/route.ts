import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { trendService } from "@/lib/server/services/trends";

/**
 * GET /api/trends/youtube?country&categoryId&keyword&publishedFrom&publishedTo&format
 *   &minSubscribers&maxSubscribers&minViews&maxViews&minComments&pageToken
 * → { items, nextPageToken, fetched, query, provider }
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess("yt-trends");
    await rateLimit("trends-youtube");
    return trendService.searchYouTube(request.nextUrl.searchParams);
  });
}
