import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoJobService } from "@/lib/server/video/service";

/** POST /api/video-production/voice-preview { voice, voiceStyle, text?, channelId } — 목소리 미리 듣기 (OpenAI TTS 1회, mp3) */
export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    await requireVideoAccess(body.channelId);
    await rateLimit("ai-generate");
    const mp3 = await videoJobService.voicePreview(body);
    return new Response(new Uint8Array(mp3), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (e) {
    // 오류는 다른 API 와 같은 JSON 형식으로
    return handle(async () => {
      throw e;
    });
  }
}
