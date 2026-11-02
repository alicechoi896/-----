import { handle, readJson } from "@/lib/server/http";
import { getCurrentUserId, getRepositories } from "@/lib/server/repositories";
import { makeThumbnail, thumbnailUrls } from "@/lib/server/video/thumbnail";
import type { VideoJob } from "@/lib/types/video-production";

export const maxDuration = 60;

/** GET /api/video-jobs/:id/thumbnail — 만든 섬네일 이미지 주소 (없으면 null) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const owner = await getCurrentUserId();
    const job = (await getRepositories().videoJobs.get((await ctx.params).id)) as VideoJob | null;
    if (!job || job.userId !== owner) return null;
    return job.qa?.thumbnail ? { ...(await thumbnailUrls(job)), sceneIndex: job.qa.thumbnail.sceneIndex, text: job.qa.thumbnail.text } : null;
  });
}

/** POST /api/video-jobs/:id/thumbnail { sceneIndex?, text? } — v0.9.147 섬네일 이미지 만들기 (세로·가로, 외부 호출 없음) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const b = await readJson<{ sceneIndex?: number; text?: string }>(request);
    const r = await makeThumbnail((await ctx.params).id, b);
    return { ...r.urls, sceneIndex: r.sceneIndex, text: r.text };
  });
}
