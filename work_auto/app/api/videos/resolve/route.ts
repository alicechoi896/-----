import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { resolveXiaohongshu } from "@/lib/server/providers/video/xiaohongshu-resolver";
import { resolveDouyin } from "@/lib/server/providers/douyin/douyin-resolver";
import { AppError } from "@/lib/server/http";
import { detectPlatform } from "@/lib/video-links";

/**
 * POST /api/videos/resolve { url } — 샤오홍슈 노트·도우인 영상의 재생 주소 찾기 (도우인은 TikHub, 응답에 있는 주소만).
 * 서버는 주소만 돌려주고, 영상 파일은 사용자 브라우저가 샤오홍슈 영상 서버에서 직접 받는다 (저장·트래픽 비용 0).
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("xhs-resolve");
    const { url } = await readJson<{ url: string }>(request);
    const target = String(url ?? "");
    if (detectPlatform(target) === "douyin") {
      const v = await resolveDouyin(target);
      if (!v.playUrls.length) throw new AppError("DOUYIN_NO_MEDIA", "이 도우인 영상의 재생 주소를 받지 못했습니다. 잠시 후 다시 시도하거나 도우인 앱에서 저장해 주세요.", 404);
      // 첫 주소를 받고, 실패하면 나머지 주소를 차례로 시도한다 (화질·워터마크 여부는 업체 응답 그대로)
      return {
        noteId: v.awemeId,
        title: v.title,
        author: v.author ?? "",
        durationSec: v.durationSec ?? 0,
        streams: [{ codec: "h264", width: 0, height: 0, size: null, url: v.playUrls[0], backupUrls: v.playUrls.slice(1) }],
      };
    }
    return resolveXiaohongshu(target);
  });
}
