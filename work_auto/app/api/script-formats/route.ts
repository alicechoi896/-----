import { requireAccess, requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scriptFormatService } from "@/lib/server/services/script-formats";
import type { ScriptFormatInput } from "@/lib/types";

/** GET /api/script-formats — 내 대본 포맷 (생성 화면의 선택지로도 쓴다) */
export async function GET() {
  return handle(async () => {
    await requireSession();
    return scriptFormatService.list();
  });
}

/** POST /api/script-formats — 만들기 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    return scriptFormatService.create(await readJson<ScriptFormatInput>(request));
  });
}
