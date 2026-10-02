import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { learningService } from "@/lib/server/services/learning";

/** POST /api/learning/:profileId/rollback — 직전 버전으로 되돌리기 (관리자) */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/learning/[profileId]/rollback">) {
  const { profileId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    return learningService.rollback(decodeURIComponent(profileId));
  });
}
