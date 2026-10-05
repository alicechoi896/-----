import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductAnalysisDraft } from "@/lib/types";

type Ctx = RouteContext<"/api/products/[productId]/relearn">;

/** POST /api/products/:id/relearn { draft } — [상세페이지 다시 학습] 결과를 같은 제품의 새 분석 버전으로 저장 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const { productId } = await ctx.params;
  return handle(async () => {
    await requireAccess("product-learning");
    const { draft } = await readJson<{ draft: ProductAnalysisDraft }>(request);
    return productService.relearn(productId, draft);
  });
}
