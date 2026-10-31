import { after } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { fashionService as svc } from "@/lib/server/fashion/service";

/** 결과물은 응답 뒤(after) 같은 함수 안에서 */
export const maxDuration = 800;

/** POST /api/fashion/:id/render { kind: feed | reels } — 피드 카드·릴스 (Canvas·FFmpeg, 외부 유료 호출 없음) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    await rateLimit("video-render");
    const { result, run } = await svc.startRender((await ctx.params).id, await readJson(request));
    after(run);
    return result;
  });
}
