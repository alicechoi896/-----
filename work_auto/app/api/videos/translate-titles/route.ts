import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { titleTranslateService } from "@/lib/server/services/title-translate";

/** POST /api/videos/translate-titles { items: [{ id, title }] } — 검색 결과 중국어 제목 → 한국어 (한 페이지 묶어 AI 1회, 저장 안 함) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("ai-generate");
    return titleTranslateService.translate(await readJson(request));
  });
}
