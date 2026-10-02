import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { photoAiService } from "@/lib/server/services/photo-ai";

export const maxDuration = 120;

/** POST /api/photos/ai-edit { image: base64 JPEG, style } — 제품 사진 배경만 AI 로 바꾸기 (OpenAI, 저장 안 함) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("blog-product-writing");
    await rateLimit("photo-ai");
    return photoAiService.edit(await readJson(request));
  });
}
