import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { trendService } from "@/lib/server/services/trends";

/** GET /api/trends/naver?scope=clip|blog&category&keyword&period */
export async function GET(request: NextRequest) {
  return handle(() => trendService.getNaverInsight(request.nextUrl.searchParams));
}
