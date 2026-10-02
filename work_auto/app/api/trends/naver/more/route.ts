import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { trendService } from "@/lib/server/services/trends";

export const maxDuration = 60;

/** GET /api/trends/naver/more?…같은 조건…&section=rising|related|ideas&offset=10 — [더보기] 10개 더 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess(request.nextUrl.searchParams.get("scope") === "blog" ? "blog-trends" : "clip-trends");
    await rateLimit("trends-naver");
    return trendService.getNaverMore(request.nextUrl.searchParams);
  });
}
