import { requireAdmin } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { costSummary, saveBudget } from "@/lib/server/costs/dashboard";

/** GET /api/admin/costs — v0.9.149 비용 대시보드 (관리자) */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return costSummary();
  });
}

/** PUT /api/admin/costs { monthUsd } — 월 예산 (관리자) */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireAdmin();
    const b = await readJson<{ monthUsd?: number | null }>(request);
    return saveBudget(b.monthUsd == null ? null : Number(b.monthUsd));
  });
}
