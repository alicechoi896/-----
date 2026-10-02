import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { savedTrendService } from "@/lib/server/services/saved-trends";

/** GET /api/trends/youtube/filters — 저장한 검색 조건 */
export async function GET() {
  return handle(async () => {
    await requireAccess("yt-trends");
    return savedTrendService.listFilters();
  });
}

/** POST /api/trends/youtube/filters { name, params, isDefault? } — 같은 이름이면 덮어쓴다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    return savedTrendService.saveFilter(await readJson(request));
  });
}
