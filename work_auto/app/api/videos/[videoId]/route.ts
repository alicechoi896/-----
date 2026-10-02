import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

/** PATCH /api/videos/:id { productId } — 연관 제품 바꾸기 (null = 연결 해제) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/videos/[videoId]">) {
  const { videoId } = await ctx.params;
  return handle(async () => {
    await requireAccess("video-import");
    const { productId } = await readJson<{ productId: string | null }>(request);
    return videoService.setProduct(videoId, productId || null);
  });
}

/** DELETE /api/videos/:id */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/videos/[videoId]">) {
  const { videoId } = await ctx.params;
  return handle(async () => {
    await requireAccess("video-import");
    await videoService.remove(videoId);
    return { id: videoId };
  });
}
