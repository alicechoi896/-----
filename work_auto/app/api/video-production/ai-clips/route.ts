import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireVideoAccess } from "@/lib/server/video/access";
import { aiClipService } from "@/lib/server/video/ai-clips";
import type { VideoPlan } from "@/lib/types/video-production";

/** POST /api/video-production/ai-clips { plan, clientRequestId } — AI 컷 만들기 (Kie AI, 아직 안 만든 컷 1개 = 1회 과금, 자동 재시도 없음) */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ plan?: VideoPlan; clientRequestId?: string }>(request);
    await requireVideoAccess(body.plan?.channelId);
    await rateLimit("ai-generate");
    return aiClipService.generate(body);
  });
}
