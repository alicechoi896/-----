import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { detailPageService } from "@/lib/server/detail-page/service";

export const maxDuration = 300;

/** GET /api/detail-page[?id=] — v0.9.167 상세페이지 목록 / 하나 (사진·완성 이미지 주소 포함) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("detail-page");
    const id = new URL(request.url).searchParams.get("id");
    return id ? detailPageService.get(id) : detailPageService.list();
  });
}

/**
 * POST /api/detail-page { action, id, ... } — 누를 때만
 * create · update · upload · product(제품 사진, 무료) · videos(영상 장면, 무료) · write(AI 1번) · render(PNG·JPG, 무료) · remove
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("detail-page");
    const b = await readJson<{ action?: string; id?: unknown; productId?: unknown; sections?: unknown; names?: unknown; keywords?: unknown; tags?: unknown; accent?: unknown; removePhoto?: unknown; dataUrl?: unknown; request?: unknown; psychology?: unknown }>(request);
    switch (b.action) {
      case "create":
        return detailPageService.create(b);
      case "update":
        return detailPageService.update(b);
      case "upload":
        return detailPageService.upload(b);
      case "product":
        return detailPageService.fromProduct(b);
      case "videos":
        return detailPageService.fromVideos(b);
      case "write":
        await rateLimit("ai-generate");
        return detailPageService.write(b);
      case "render":
        return detailPageService.render(b);
      case "remove":
        return detailPageService.remove(b.id);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
