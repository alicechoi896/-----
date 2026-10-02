import { requireAccess, requireAnyAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductUpdateInput } from "@/lib/types";

type Ctx = RouteContext<"/api/products/[productId]">;

/** GET /api/products/:id — 제품 + 현재 분석 + 원본 수집 데이터 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAnyAccess(["product-library", "product-learning", "yt-product-video", "clip-product-content", "blog-product-writing", "blog-auto-writing", "ai-learning"]);
    return productService.getDetail(productId);
  });
}

/** PATCH /api/products/:id — 제품 정보 / 콘텐츠 제작용 데이터 수정 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAccess("product-library");
    return productService.update(productId, await readJson<ProductUpdateInput>(request));
  });
}

/** DELETE /api/products/:id */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAccess("product-library");
    await productService.remove(productId);
    return { id: productId };
  });
}
