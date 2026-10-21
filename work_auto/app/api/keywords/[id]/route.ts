import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/** PATCH /api/keywords/:id { productId, productHint, pinned, hidden, status, note } / DELETE */
export async function PATCH(request: Request, ctx: RouteContext<"/api/keywords/[id]">) {
  return handle(async () => {
    await requireAccess("ai-learning");
    return keywordLibrary.update((await ctx.params).id, await readJson(request));
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/keywords/[id]">) {
  return handle(async () => {
    await requireAccess("ai-learning");
    const { id } = await ctx.params;
    await keywordLibrary.remove(id);
    return { id };
  });
}
