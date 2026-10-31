import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";

export const maxDuration = 60;

/** POST /api/fashion/:id/register { key, fileName, target } — 올린 파일 잇기 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.register((await ctx.params).id, await readJson(request));
  });
}
