import { requireAdmin } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { errorLogService } from "@/lib/server/services/error-log";

/** GET /api/admin/errors?days=7 — 오류 기록 (관리자) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const days = Math.max(1, Math.min(30, Number(new URL(request.url).searchParams.get("days")) || 7));
    return errorLogService.list(days);
  });
}

/** DELETE /api/admin/errors { ids: string[] | "all" } — 지우기 (관리자) */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const { ids } = await readJson<{ ids: string[] | "all" }>(request);
    return { deleted: await errorLogService.remove(ids === "all" ? "all" : (Array.isArray(ids) ? ids.map(String) : []).slice(0, 500)) };
  });
}
