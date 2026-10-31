import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { readAiOptions, saveAiOptions } from "@/lib/server/settings/ai-options";

/** GET /api/ai-options — AI 생성 공통 옵션 (마케팅 심리 원칙 등). 외부 호출 없음 */
export async function GET() {
  return handle(async () => {
    await requireAccess("ai-learning");
    return readAiOptions();
  });
}

/** PATCH /api/ai-options { psychology } — 켜고 끄기 (모든 원고 생성·새벽 자동 제작에 적용) */
export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireAccess("ai-learning");
    return saveAiOptions(await readJson(request), session.user.email);
  });
}
