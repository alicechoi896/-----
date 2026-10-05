import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productUrlLearning } from "@/lib/server/services/product-url-learning";

export const maxDuration = 120;

/** POST /api/products/analyze-collected { raw } — 수집한 상품 정보 → AI 분석 (Bright Data 0회, AI 만 다시 시도 가능) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("product-analyze");
    return productUrlLearning.analyze(await readJson(request));
  });
}
