import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

export const maxDuration = 60;

/** POST /api/videos/batch { urls: string[], note? } — 여러 영상 한 번에 가져오기 (URL 별 성공·실패) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const { urls, note } = await readJson<{ urls: string[]; note?: string }>(request);
    return videoService.importMany(urls, note);
  });
}
