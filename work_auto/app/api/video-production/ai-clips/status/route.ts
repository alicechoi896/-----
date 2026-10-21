import { handle, readJson } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { aiClipService } from "@/lib/server/video/ai-clips";

/** POST /api/video-production/ai-clips/status { clips, channelId } — AI 컷 상태 (Kie recordInfo, 무료) */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ clips?: unknown; channelId?: unknown }>(request);
    await requireVideoAccess(body.channelId);
    return aiClipService.status(body);
  });
}
