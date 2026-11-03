import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { carouselService } from "@/lib/server/carousel/service";

export const maxDuration = 300;

/** GET /api/carousel[?id=] — v0.9.163 제품 캐러셀 목록 / 하나 (사진·완성 이미지 주소 포함) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("product-carousel");
    const id = new URL(request.url).searchParams.get("id");
    return id ? carouselService.get(id) : carouselService.list();
  });
}

/**
 * POST /api/carousel { action, id, ... } — 누를 때만
 * create · update · upload · product(제품 사진, 무료) · videos(영상 장면 뽑기, 무료) · write(AI 1번) · render(PNG, 무료) · remove
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-carousel");
    const b = await readJson<{ action?: string; id?: unknown; productId?: unknown; contentId?: unknown; name?: unknown; slides?: unknown; caption?: unknown; hashtags?: unknown; font?: unknown; removePhoto?: unknown; dataUrl?: unknown; count?: unknown; request?: unknown }>(request);
    switch (b.action) {
      case "create":
        return carouselService.create(b);
      case "update":
        return carouselService.update(b);
      case "upload":
        return carouselService.upload(b);
      case "product":
        return carouselService.fromProduct(b);
      case "videos":
        return carouselService.fromVideos(b);
      case "write":
        await rateLimit("ai-generate");
        return carouselService.write(b);
      case "render":
        return carouselService.render(b);
      case "remove":
        return carouselService.remove(b.id);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
