import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { resolveXiaohongshu } from "@/lib/server/providers/video/xiaohongshu-resolver";

/**
 * POST /api/videos/resolve { url } — 샤오홍슈 노트의 영상 주소 찾기.
 * 서버는 주소만 돌려주고, 영상 파일은 사용자 브라우저가 샤오홍슈 영상 서버에서 직접 받는다 (저장·트래픽 비용 0).
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("xhs-resolve");
    const { url } = await readJson<{ url: string }>(request);
    return resolveXiaohongshu(String(url ?? ""));
  });
}
