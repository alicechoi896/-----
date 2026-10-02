import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductUpdateInput } from "@/lib/types";

type Ctx = RouteContext<"/api/products/[productId]">;

/** GET /api/products/:id — 제품 + 현재 분석 + 원본 수집 데이터 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(() => productService.getDetail(productId));
}

/** PATCH /api/products/:id — 제품 정보 / 콘텐츠 제작용 데이터 수정 */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => productService.update(productId, await readJson<ProductUpdateInput>(request)));
}

/** DELETE /api/products/:id */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await productService.remove(productId);
    return { id: productId };
  });
}
