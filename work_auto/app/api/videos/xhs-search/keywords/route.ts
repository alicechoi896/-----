import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { xhsSearchService } from "@/lib/server/services/xhs-search";

/** POST /api/videos/xhs-search/keywords { keyword } — [AI 중국어 검색어 추천] (누를 때만 AI 1회) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("ai-generate");
    const { keyword } = await readJson<{ keyword?: string }>(request);
    return xhsSearchService.suggestKeywords(keyword);
  });
}
