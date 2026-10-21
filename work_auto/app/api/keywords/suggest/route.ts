import { requireSession } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/** GET /api/keywords/suggest?productId= — 원고 생성 화면: 이 제품의 뜨는 키워드 (DB 만, 외부 호출 0) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireSession();
    const productId = new URL(request.url).searchParams.get("productId") ?? "";
    return productId ? keywordLibrary.suggest(productId) : [];
  });
}
