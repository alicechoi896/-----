import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";


/** POST /api/drama-studio/:id/upload-url { kind, fileName, size } — 직접 올릴 주소 (Storage 서명 주소) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.uploadUrl((await ctx.params).id, await readJson(request));
  });
}
