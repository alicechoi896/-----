import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { instagramTrendService } from "@/lib/server/services/instagram-trends";
import { after } from "next/server";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/**
 * POST /api/trends/instagram { keyword, next?, clientRequestId, source?: "meta"|"tikhub", kind?: "top"|"recent" }
 * 인스타그램 릴스 검색: meta = 공식 API(무료·해시태그), tikhub = [검색]·[더 보기] 1번 = TikHub 1회
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ig-trends");
    const body = await readJson<Record<string, unknown>>(request);
    await rateLimit("xhs-search");
    const result = await instagramTrendService.search(body);
    // 키워드 관리 자동 수집: 릴스 해시태그 (새로 받은 결과만, 추가 호출 0)
    if (result.calls) after(() => keywordLibrary.ingestQuietly(result.items.flatMap((r) => r.hashtags.slice(0, 5).map((keyword) => ({ keyword, origin: "instagram" as const, views: r.plays ?? r.likes })))));
    return result;
  });
}
