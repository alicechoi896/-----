import { handle } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";

/** GET /api/admin/audit-logs — 활동 기록 (관리자 전용) */
export async function GET() {
  return handle(() => adminService.listAuditLogs());
}
