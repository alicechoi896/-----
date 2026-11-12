import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { contentSetService as svc, type SetTarget } from "@/lib/server/sets/service";

export const maxDuration = 300;

/** GET /api/sets[?id=] — 콘텐츠 세트 목록·하나 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("content-set");
    const id = new URL(request.url).searchParams.get("id");
    return id ? svc.get(id) : svc.list();
  });
}

/**
 * POST /api/sets { action, ... } — v0.9.199
 * from-content { contentId } · from-carousel { carouselId } · update { id, core } · make { id, target: script|blog|carousel|threads } (AI 1번) · remove { id }
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("content-set");
    const b = await readJson<{ action?: string; id?: unknown; contentId?: unknown; carouselId?: unknown; core?: Record<string, unknown>; target?: unknown }>(request);
    switch (b.action) {
      case "from-content":
        return svc.fromContent(b.contentId);
      case "from-carousel":
        return svc.fromCarousel(b.carouselId);
      case "update":
        return svc.updateCore(b.id, (b.core ?? {}) as never);
      case "make": {
        const target = String(b.target) as SetTarget;
        if (!["script", "blog", "carousel", "threads"].includes(target)) throw new AppError("VALIDATION", "만들 것을 골라 주세요.");
        const s = await svc.get(b.id);
        // 만드는 화면의 권한도 확인 (영상 원고·블로그·캐러셀)
        const need = target === "script" ? (s.core.productId ? "yt-product-video" : "yt-info-video") : target === "blog" ? (s.core.productId ? "blog-product-writing" : "blog-info-writing") : target === "carousel" ? "product-carousel" : "content-set";
        await requireAccess(need);
        await rateLimit("ai-generate");
        return svc.make(b.id, target);
      }
      case "remove":
        await svc.remove(b.id);
        return { ok: true };
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
