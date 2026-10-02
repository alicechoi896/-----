import { requireSession } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { trendService } from "@/lib/server/services/trends";

/** GET /api/trends/options?source=youtube|naver — 생성 폼의 "트렌드 선택" 목록 */
export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source") === "naver" ? "naver" : "youtube";
  return handle(async () => {
    await requireSession();
    return trendService.listOptions(source);
  });
}
