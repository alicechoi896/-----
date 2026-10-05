import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productUrlLearning } from "@/lib/server/services/product-url-learning";

export const maxDuration = 60;

/**
 * POST /api/products/learn-url { url, clientRequestId, force?, productId? } — [상세페이지 학습] 클릭 1번
 * 이미 학습한 상품이면 { status: "existing" } (Bright Data 0회), 새 상품이면 Trigger 정확히 1회 → { status: "collecting", jobId } 또는 { status: "collected", raw }
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("product-analyze");
    return productUrlLearning.start(await readJson(request));
  });
}
