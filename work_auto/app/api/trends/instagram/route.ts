import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { instagramTrendService } from "@/lib/server/services/instagram-trends";

/** POST /api/trends/instagram { keyword, next?, clientRequestId } — 인스타그램 릴스 검색 ([검색]·[더 보기] 1번 = TikHub 1회) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ig-trends");
    const body = await readJson<Record<string, unknown>>(request);
    await rateLimit("xhs-search");
    return instagramTrendService.search(body);
  });
}
