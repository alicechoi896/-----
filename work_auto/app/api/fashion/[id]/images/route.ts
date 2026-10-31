import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { fashionService as svc } from "@/lib/server/fashion/service";

export const maxDuration = 120;

/** POST /api/fashion/:id/images { jobs, clientRequestId, confirmed } — Kie 이미지 (1장 = 1회 과금, 확인 후에만) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    await rateLimit("ai-generate");
    return svc.images((await ctx.params).id, await readJson(request));
  });
}
