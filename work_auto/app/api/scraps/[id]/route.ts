import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scrapService } from "@/lib/server/services/scraps";

/** PATCH /api/scraps/:id { folder } — 분류 옮기기 / DELETE — 스크랩 삭제 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/scraps/[id]">) {
  return handle(async () => {
    await requireAccess("scraps");
    const { folder } = await readJson<{ folder?: string }>(request);
    return scrapService.move((await ctx.params).id, folder);
  });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/scraps/[id]">) {
  return handle(async () => {
    await requireAccess("scraps");
    const { id } = await ctx.params;
    await scrapService.remove(id);
    return { id };
  });
}
