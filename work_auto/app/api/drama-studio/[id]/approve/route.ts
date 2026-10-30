import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";


/** POST /api/drama-studio/:id/approve { step } — 단계 승인 (앞 단계가 승인돼야 한다) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.approve((await ctx.params).id, await readJson(request));
  });
}
