import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 120;

/** POST /api/drama-studio/:id/lipsync { clipId, clientRequestId, confirmed } — 립싱크 시험 (Kie 1회, 확인 후에만) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("ai-generate");
    return svc.lipsync((await ctx.params).id, await readJson(request));
  });
}
