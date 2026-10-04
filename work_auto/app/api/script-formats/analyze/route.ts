import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { scriptFormatService } from "@/lib/server/services/script-formats";

export const maxDuration = 60;

/** POST /api/script-formats/analyze { examples, contentType } — 참고 대본 → 포맷 가이드라인 (AI). 저장하지 않는다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("ai-generate");
    return scriptFormatService.analyze(await readJson<{ examples: unknown; contentType: string }>(request));
  });
}
