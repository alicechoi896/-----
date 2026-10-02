import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

/** DELETE /api/videos/:id */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/videos/[videoId]">) {
  const { videoId } = await ctx.params;
  return handle(async () => {
    await requireAccess("video-import");
    await videoService.remove(videoId);
    return { id: videoId };
  });
}
