import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { multicamService } from "@/lib/server/multicam/service";

export const maxDuration = 300;

/** GET /api/multicam[?id=] — v0.9.176 AI 메이크업(멀티앵글) 목록 / 하나 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("ai-makeup");
    const id = new URL(request.url).searchParams.get("id");
    return id ? multicamService.get(id) : multicamService.list();
  });
}

/**
 * POST /api/multicam { action, id, ... } — 누를 때만 (자동 재시도 없음)
 * upload-url · probe · update · plan(AI 1번) · generate(Kie Seedance, confirmed 필수) · status(무료) · remove
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-makeup");
    const b = await readJson<{ action?: string; id?: unknown; name?: unknown; size?: unknown; from?: unknown; to?: unknown; subject?: unknown; cuts?: unknown; model?: unknown; resolution?: unknown; keepAudio?: unknown; promptOverride?: unknown; confirmed?: unknown }>(request);
    switch (b.action) {
      case "upload-url":
        return multicamService.uploadUrl(b);
      case "probe":
        return multicamService.probe(b);
      case "update":
        return multicamService.update(b);
      case "plan":
        await rateLimit("ai-generate");
        return multicamService.plan(b);
      case "generate":
        return multicamService.generate(b);
      case "status":
        return multicamService.status(b);
      case "remove":
        return multicamService.remove(b.id);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
