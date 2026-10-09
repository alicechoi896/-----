import { handle } from "@/lib/server/http";
import { videoJobService } from "@/lib/server/video/service";

/** POST /api/video-jobs/:id/download — 1회 다운로드 주소 (10분). 받은 뒤 1시간이 지나면 파일을 지운다 */
export async function POST(_request: Request, ctx: RouteContext<"/api/video-jobs/[id]/download">) {
  return handle(async () => ({ url: await videoJobService.downloadUrl((await ctx.params).id) }));
}
