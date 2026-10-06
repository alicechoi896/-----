import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { thumbnailTextService } from "@/lib/server/services/thumbnail-text";

export const maxDuration = 60;

/** POST /api/trends/youtube/thumbnail-text { videoIds } — 썸네일 큰 글자 읽기 (AI Vision, 최대 10개, YouTube API 0회) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-trends");
    await rateLimit("ai-generate");
    const { videoIds } = await readJson<{ videoIds?: unknown }>(request);
    return thumbnailTextService.read(videoIds);
  });
}
