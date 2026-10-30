import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 300;

/** POST /api/drama-studio/:id/images { jobs, modelId, clientRequestId, confirmed } — Kie 이미지 (1장 = 1회 과금, 확인 후에만) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("ai-generate");
    return svc.images((await ctx.params).id, await readJson(request));
  });
}
