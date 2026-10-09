import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scrapService } from "@/lib/server/services/scraps";

/** PATCH /api/scraps/folders { from, to } — 분류 이름 바꾸기 (to 가 비면 분류 없음으로) */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireAccess("scraps");
    const { from, to } = await readJson<{ from?: string; to?: string }>(request);
    return scrapService.renameFolder(from, to);
  });
}
