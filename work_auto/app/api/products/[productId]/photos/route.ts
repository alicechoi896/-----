import type { NextRequest } from "next/server";
import { requireAccess, requireAnyAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { productPhotoService } from "@/lib/server/services/product-photos";

export const maxDuration = 60;

type Ctx = { params: Promise<{ productId: string }> };

/** GET /api/products/:id/photos — v0.9.172 제품 '내 사진' (올린 순서, 미리보기 주소 1시간) */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAnyAccess(["product-library", "ai-stay", "detail-page"]);
    return productPhotoService.list(productId);
  });
}

/** POST /api/products/:id/photos { action: upload(dataUrl) | remove(key) | order(keys) } — 무료 (외부 호출 없음) */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAccess("product-library");
    const b = await readJson<{ action?: string; dataUrl?: unknown; key?: unknown; keys?: unknown }>(request);
    switch (b.action) {
      case "upload":
        return productPhotoService.upload(productId, b.dataUrl);
      case "remove":
        return productPhotoService.remove(productId, b.key);
      case "order":
        return productPhotoService.order(productId, b.keys);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
