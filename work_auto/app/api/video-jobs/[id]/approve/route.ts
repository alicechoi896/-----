import { handle } from "@/lib/server/http";
import { videoJobService } from "@/lib/server/video/service";

/** POST /api/video-jobs/:id/approve — 검수 완료 (업로드 관리로 넘길 수 있음) */
export async function POST(_request: Request, ctx: RouteContext<"/api/video-jobs/[id]/approve">) {
  return handle(async () => videoJobService.approve((await ctx.params).id));
}
