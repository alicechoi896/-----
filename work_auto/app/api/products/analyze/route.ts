import { handle, readJson } from "@/lib/server/http";
import { productService } from "@/lib/server/services/products";
import type { ProductSourceInput } from "@/lib/types";

/** POST /api/products/analyze { source } — Collector → Analyzer. 저장하지 않고 Draft 를 돌려준다 */
export async function POST(request: Request) {
  return handle(async () => {
    const { source } = await readJson<{ source: ProductSourceInput }>(request);
    return productService.analyze(source);
  });
}
