import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

/** GET /api/contents?featureId&productId — 콘텐츠 히스토리 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return handle(() =>
    memoryService.listContents({
      featureId: params.get("featureId") ?? undefined,
      productId: params.get("productId") ?? undefined,
    }),
  );
}
