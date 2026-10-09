import { handle, readJson } from "@/lib/server/http";
import { requireAccess } from "@/lib/server/auth";
import { scriptFormatService } from "@/lib/server/services/script-formats";

/** POST /api/script-formats/captions { formatId | newFormat, captions, titles } — 캡션은 '캡션'에, 제목은 '제목 패턴'에 (외부 호출 0) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    return scriptFormatService.addCaptions(await readJson(request));
  });
}
