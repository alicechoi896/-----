import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";

export const maxDuration = 120;

/** POST /api/fashion/:id/sync — 진행 중 Kie 작업 상태 확인 (무료) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.sync((await ctx.params).id);
  });
}
