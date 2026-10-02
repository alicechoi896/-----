import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productService } from "@/lib/server/services/products";
import type { ProductSourceInput } from "@/lib/types";


/** 실제 AI 응답은 수십 초 걸릴 수 있어 함수 실행 시간을 늘린다 */
export const maxDuration = 120;

/** POST /api/products/analyze { source } — Collector → Analyzer. 저장하지 않고 Draft 를 돌려준다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("product-analyze");
    const { source } = await readJson<{ source: ProductSourceInput }>(request);
    return productService.analyze(source);
  });
}
