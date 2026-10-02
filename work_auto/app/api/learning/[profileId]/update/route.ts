import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { learningService } from "@/lib/server/services/learning";

export const maxDuration = 120;

/** POST /api/learning/:profileId/update — [지금 학습 업데이트] (AI 1회) */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/learning/[profileId]/update">) {
  const { profileId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("ai-generate");
    return learningService.update(decodeURIComponent(profileId));
  });
}
