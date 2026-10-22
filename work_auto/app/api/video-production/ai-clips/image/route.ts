import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireVideoAccess } from "@/lib/server/video/access";
import { aiClipService } from "@/lib/server/video/ai-clips";

/** POST /api/video-production/ai-clips/image { dataUrl, channelId } — AI 컷용 제품 사진 직접 올리기 (9:16 → Kie 파일, 무료·24시간) */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ dataUrl?: string; channelId?: string }>(request);
    await requireVideoAccess(body.channelId);
    await rateLimit("ai-generate");
    return aiClipService.uploadImage(body);
  });
}
