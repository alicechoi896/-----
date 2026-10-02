import { requireAccess, requireAnyAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductAnalysisDraft } from "@/lib/types";

/** GET /api/products — 제품 라이브러리 목록 */
export async function GET() {
  return handle(async () => {
    await requireAnyAccess(["product-library", "product-learning", "yt-product-video", "clip-product-content", "blog-product-writing", "blog-auto-writing", "ai-learning"]);
    return productService.list();
  });
}

/** POST /api/products — 분석 결과(Draft)를 제품 라이브러리에 저장 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    return productService.save(await readJson<ProductAnalysisDraft>(request));
  });
}
