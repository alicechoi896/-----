import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { photoCaptioner } from "@/lib/server/services/photo-captioner";

export const maxDuration = 60;

/** POST /api/contents/describe-photos { images: [{ mediaType, data }], productName? } — 사진 설명 (AI Vision, 저장 안 함) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("blog-product-writing");
    await rateLimit("describe-photos");
    return photoCaptioner.describe(await readJson(request));
  });
}
