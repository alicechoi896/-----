import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { relinkVideo } from "@/lib/server/video/vault";

export const maxDuration = 60;

/** POST /api/videos/vault { videoId, url } — 같은 영상의 샤오홍슈 공유 링크(xhslink, 영구)로 바꾸기 (무료로 열리는지 시험, TikHub 안 씀) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("video-import");
    const b = await readJson<{ videoId?: string; url?: string }>(request);
    return relinkVideo(String(b.videoId ?? ""), String(b.url ?? ""));
  });
}
