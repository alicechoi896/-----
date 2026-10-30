import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 300;

/** POST /api/drama-studio/:id/sync — 진행 중 작업 상태 확인 (무료) · 끝난 결과를 Storage 로 복사 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    void request;
    return svc.sync((await ctx.params).id);
  });
}
