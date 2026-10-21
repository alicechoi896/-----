import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { trendService } from "@/lib/server/services/trends";
import { after } from "next/server";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/**
 * GET /api/trends/youtube?country&categoryId&keyword&publishedFrom&publishedTo&format
 *   &minSubscribers&maxSubscribers&minViews&maxViews&minComments&pageToken
 * → { items, nextPageToken, fetched, query, provider }
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess("yt-trends");
    await rateLimit("trends-youtube");
    const result = await trendService.searchYouTube(request.nextUrl.searchParams);
    // 키워드 관리 자동 수집: 받은 영상의 태그·키워드 (추가 호출 0)
    after(() => keywordLibrary.ingestQuietly(result.items.slice(0, 50).flatMap((it) => (it.tags.length ? it.tags : it.keywords).slice(0, 5).map((keyword) => ({ keyword, origin: "youtube-trend" as const, views: it.views })))));
    return result;
  });
}
