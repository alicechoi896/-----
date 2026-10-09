import { after } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";
import type { VideoPlan } from "@/lib/types/video-production";

/** 렌더는 응답 뒤(after) 같은 함수 안에서 — 최대 실행 시간 (Vercel) */
export const maxDuration = 300;

/** GET /api/video-jobs?channelId= — 내 영상 작업 (최근 20개, 오래된 파일 정리) */
export async function GET(request: Request) {
  return handle(async () => {
    const ch = await requireVideoAccess(new URL(request.url).searchParams.get("channelId"));
    return videoJobService.list(ch);
  });
}

/** POST /api/video-jobs { plan } — [영상 만들기]: 작업을 만들고 바로 응답, 렌더는 백그라운드 */
export async function POST(request: Request) {
  return handle(async () => {
    const { plan } = await readJson<{ plan?: VideoPlan }>(request);
    await requireVideoAccess(plan?.channelId);
    await rateLimit("video-render");
    const job = await videoJobService.create({ plan });
    after(() => videoJobService.run(job.id));
    return job;
  });
}
