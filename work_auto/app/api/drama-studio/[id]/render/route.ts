import { after } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

/** 병합은 응답 뒤(after) 같은 함수 안에서 — 최대 실행 시간 (Vercel) */
export const maxDuration = 800;

/** POST /api/drama-studio/:id/render — 타임라인을 하나의 MP4 로 (FFmpeg, 외부 유료 호출 없음) */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("video-render");
    const { result, run } = await svc.startRender((await ctx.params).id);
    after(run);
    return result;
  });
}
