import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

/** PATCH /api/contents/:id { isExemplar } — "좋은 결과로 저장" */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/contents/[contentId]">) {
  const { contentId } = await ctx.params;
  return handle(async () => {
    const { isExemplar } = await readJson<{ isExemplar: boolean }>(request);
    return memoryService.setExemplar(contentId, Boolean(isExemplar));
  });
}
