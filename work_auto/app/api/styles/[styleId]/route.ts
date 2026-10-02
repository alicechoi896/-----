import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

type Ctx = RouteContext<"/api/styles/[styleId]">;

/** PATCH /api/styles/:id — 채널 기본 스타일로 지정 */
export async function PATCH(_request: NextRequest, ctx: Ctx) {
  const { styleId } = await ctx.params;
  return handle(() => memoryService.setDefaultStyle(styleId));
}

/** DELETE /api/styles/:id */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { styleId } = await ctx.params;
  return handle(async () => {
    await memoryService.removeStyle(styleId);
    return { id: styleId };
  });
}
