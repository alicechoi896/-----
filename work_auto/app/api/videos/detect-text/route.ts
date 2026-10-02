import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { videoTextDetector, type DetectInput } from "@/lib/server/services/video-text-detector";

export const maxDuration = 120;

/** POST /api/videos/detect-text { frames: [{ t, data(JPEG base64) }] } — 덧씌운 글자 위치 (AI Vision, 저장 안 함) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    return videoTextDetector.detect(await readJson<DetectInput>(request));
  });
}
