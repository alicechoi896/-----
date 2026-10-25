import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { silenceCutService } from "@/lib/server/services/silence-cut";

export const maxDuration = 300;

/** POST /api/tools/silence-cut/cut { key, minSilence, noiseDb, pad, fileName } — 무음 구간을 모두 잘라 낸 영상 (다운로드 주소 1시간) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("silence-cut");
    await rateLimit("video-render");
    return silenceCutService.cut(await readJson(request));
  });
}
