import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";

/** GET /api/fashion/:id — 프로젝트 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.get((await ctx.params).id);
  });
}

/** PATCH /api/fashion/:id { section, value } — 부분 저장 (자동 저장) */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.patch((await ctx.params).id, await readJson(request));
  });
}

/** DELETE /api/fashion/:id — 목록에서 빼기 (파일은 보관) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.remove((await ctx.params).id);
  });
}
