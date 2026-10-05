import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scheduleLearning } from "@/lib/server/services/learning";
import { youtubeStatsService } from "@/lib/server/services/youtube-stats";

type Ctx = RouteContext<"/api/publications/[publicationId]/views">;

/** POST /api/publications/:id/views { views, likes?, comments? } — 직접 넣은 조회수 → 성과 데이터 (학습 신호) */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { publicationId } = await ctx.params;
  return handle(async () => {
    await requireAccess("uploads");
    const row = await youtubeStatsService.recordManual(publicationId, await readJson<{ views?: unknown; likes?: unknown; comments?: unknown }>(request));
    scheduleLearning(row.contentId);
    return row;
  });
}
