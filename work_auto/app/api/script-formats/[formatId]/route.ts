import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scriptFormatService } from "@/lib/server/services/script-formats";
import type { ScriptFormatInput } from "@/lib/types";

type Ctx = RouteContext<"/api/script-formats/[formatId]">;

/** PUT /api/script-formats/:id — 수정 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { formatId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    return scriptFormatService.update(formatId, await readJson<ScriptFormatInput>(request));
  });
}

/** PATCH /api/script-formats/:id — 이 유형의 기본 포맷으로 */
export async function PATCH(_request: NextRequest, ctx: Ctx) {
  const { formatId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    return scriptFormatService.setDefault(formatId);
  });
}

/** DELETE /api/script-formats/:id */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { formatId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    await scriptFormatService.remove(formatId);
    return { id: formatId };
  });
}
