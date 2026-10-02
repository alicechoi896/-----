import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductAnalysisDraft } from "@/lib/types";

/** GET /api/products — 제품 라이브러리 목록 */
export async function GET() {
  return handle(() => productService.list());
}

/** POST /api/products — 분석 결과(Draft)를 제품 라이브러리에 저장 */
export async function POST(request: Request) {
  return handle(async () => productService.save(await readJson<ProductAnalysisDraft>(request)));
}
