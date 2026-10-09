import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { instagramTrendService } from "@/lib/server/services/instagram-trends";

/** POST /api/trends/instagram/media { code } — 재생 주소 (검색 결과에 없을 때만, ▶ 1번 = TikHub 1회) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ig-trends");
    await rateLimit("xhs-resolve");
    return instagramTrendService.media(await readJson<{ code?: string }>(request));
  });
}
