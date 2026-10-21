import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { trendService } from "@/lib/server/services/trends";
import { after } from "next/server";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

export const maxDuration = 60;

/** GET /api/trends/naver?scope=clip|blog&category&keyword&period */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await requireAccess(request.nextUrl.searchParams.get("scope") === "blog" ? "blog-trends" : "clip-trends");
    await rateLimit("trends-naver");
    const result = await trendService.getNaverInsight(request.nextUrl.searchParams);
    // 키워드 관리 자동 수집: 급상승 키워드·급상승 주제 키워드 (추가 호출 0)
    const ins = result.insight;
    after(() => keywordLibrary.ingestQuietly([...ins.risingKeywords.map((k) => ({ keyword: k.text, origin: "naver-trend" as const })), ...ins.risingTopics.flatMap((t) => t.keywords.slice(0, 3).map((keyword) => ({ keyword, origin: "naver-trend" as const })))]));
    return result;
  });
}
