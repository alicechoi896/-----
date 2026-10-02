import { handle, readJson } from "@/lib/server/http";
import { settingsService } from "@/lib/server/services/settings";
import type { UserSettingsInput } from "@/lib/types";

/** GET /api/settings — 내 설정 (기본 AI 등) */
export async function GET() {
  return handle(() => settingsService.get());
}

/** PATCH /api/settings { preferredAi } */
export async function PATCH(request: Request) {
  return handle(async () => settingsService.update(await readJson<UserSettingsInput>(request)));
}
