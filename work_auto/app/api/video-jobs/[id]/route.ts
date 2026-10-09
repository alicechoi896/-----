import { handle } from "@/lib/server/http";
import { videoJobService } from "@/lib/server/video/service";

/** GET /api/video-jobs/:id — 진행 상태 + 미리보기 주소 (10분) */
export async function GET(_request: Request, ctx: RouteContext<"/api/video-jobs/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const job = await videoJobService.get(id);
    const previewUrl = ["completed", "needs_review", "approved"].includes(job.status) ? await videoJobService.previewUrl(id) : null;
    return { ...job, fileUrl: previewUrl };
  });
}
