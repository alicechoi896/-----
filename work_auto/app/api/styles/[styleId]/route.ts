import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";
import type { UserStyleInput } from "@/lib/types";

type Ctx = RouteContext<"/api/styles/[styleId]">;

/** PUT /api/styles/:id — 스타일 수정 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { styleId } = await ctx.params;
  return handle(async () => memoryService.updateStyle(styleId, await readJson<UserStyleInput>(request)));
}

/** PATCH /api/styles/:id — 기본 스타일로 지정 (적용 채널이 겹치는 다른 기본 스타일은 해제) */
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
