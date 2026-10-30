import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 300;

/** POST /api/drama-studio/:id/generate { action, … } — AI 글 생성 (아이디어·로그라인·인물·시나리오·영어 프롬프트). 버튼 1번 = AI 1~몇 회 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("ai-generate");
    return svc.generate((await ctx.params).id, await readJson(request));
  });
}
