import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";


/** POST /api/fashion/:id/upload-url { kind, fileName, size } — 올릴 주소 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.uploadUrl((await ctx.params).id, await readJson(request));
  });
}
