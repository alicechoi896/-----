import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/** POST /api/keywords/interest { ids } — 고른 키워드(최대 5개) NAVER 데이터랩 상대 관심도 (1회) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("trends-naver");
    const { ids } = await readJson<{ ids?: unknown }>(request);
    return keywordLibrary.refreshInterest(ids);
  });
}
