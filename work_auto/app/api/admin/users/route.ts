import { handle } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";

/** GET /api/admin/users — 사용자 목록 (관리자 전용) */
export async function GET() {
  return handle(() => adminService.listUsers());
}
