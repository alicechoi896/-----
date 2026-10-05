import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

/** GET /api/videos/page?productId=&offset= — 기존 참고 영상 30개씩 (productId: 제품 id / none / all). [더 불러오기]마다 다음 offset */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const sp = new URL(request.url).searchParams;
    return videoService.page({ productId: sp.get("productId"), offset: sp.get("offset") });
  });
}
