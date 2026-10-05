import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productUrlLearning } from "@/lib/server/services/product-url-learning";

export const maxDuration = 60;

/** POST /api/products/learn-url/status { jobId, url, clientRequestId } — 같은 수집 작업의 상태만 (새 Trigger 없음) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("brightdata-status");
    return productUrlLearning.status(await readJson(request));
  });
}
