import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { fashionService as svc } from "@/lib/server/fashion/service";

export const maxDuration = 120;

/** POST /api/fashion/:id/action { action, … } — AI 문구(1회)·제품 라이브러리 가져오기·지우기 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    await rateLimit("ai-generate");
    return svc.action((await ctx.params).id, await readJson(request));
  });
}
