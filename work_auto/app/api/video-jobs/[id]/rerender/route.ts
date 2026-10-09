import { after } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { videoJobService } from "@/lib/server/video/service";
import type { VideoPlan } from "@/lib/types/video-production";

export const maxDuration = 300;

/** POST /api/video-jobs/:id/rerender { plan? } — 클립 교체 등으로 다시 렌더 (컷 계획 AI 재호출 없음) */
export async function POST(request: Request, ctx: RouteContext<"/api/video-jobs/[id]/rerender">) {
  return handle(async () => {
    const { plan } = await readJson<{ plan?: VideoPlan }>(request);
    await rateLimit("video-render");
    const job = await videoJobService.rerender((await ctx.params).id, plan);
    after(() => videoJobService.run(job.id));
    return job;
  });
}
