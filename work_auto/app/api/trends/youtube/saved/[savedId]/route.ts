import { requireSession } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { savedTrendService } from "@/lib/server/services/saved-trends";

/** DELETE /api/trends/youtube/saved/:id — 찜 해제 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/trends/youtube/saved/[savedId]">) {
  const { savedId } = await ctx.params;
  return handle(async () => {
    await requireSession();
    await savedTrendService.remove(savedId);
    return { id: savedId };
  });
}
