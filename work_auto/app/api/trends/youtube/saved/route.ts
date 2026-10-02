import { requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { savedTrendService } from "@/lib/server/services/saved-trends";
import type { YouTubeTrendItem } from "@/lib/types";

/** GET /api/trends/youtube/saved — 찜한 영상 */
export async function GET() {
  return handle(async () => {
    await requireSession();
    return savedTrendService.list();
  });
}

/** POST /api/trends/youtube/saved { item } — 찜하기 (이미 찜했으면 그대로 돌려준다) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    const { item } = await readJson<{ item: Partial<YouTubeTrendItem> }>(request);
    return savedTrendService.add(item);
  });
}
