import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productUrlLearning } from "@/lib/server/services/product-url-learning";

/**
 * POST /api/products/learn-html { url, html } — v0.9.178 쿠팡 트래블: 브라우저에서 저장한 숙소 페이지(HTML)로 학습 (외부 호출 0회)
 * 쿠팡이 서버(Vercel) 접속을 막을 때 쓴다. → { status: "existing" } 또는 { status: "collected", raw }
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("product-analyze");
    return productUrlLearning.fromHtml(await readJson(request));
  });
}
