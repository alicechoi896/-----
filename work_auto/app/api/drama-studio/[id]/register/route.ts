import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 120;

/** POST /api/drama-studio/:id/register { key, kind, fileName, target } — 올린 파일을 캐릭터 시트·스토리보드·클립·배경음악에 잇기 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.register((await ctx.params).id, await readJson(request));
  });
}
