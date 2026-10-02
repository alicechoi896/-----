import { handle, readJson } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";
import type { MemberTier } from "@/lib/types";

/** GET /api/admin/permissions — 등급별 권한표 (관리자 전용) */
export async function GET() {
  return handle(() => adminService.getPermissionMatrix());
}

/** PUT /api/admin/permissions { role, permissionKey, allowed } — 권한 한 칸 변경 */
export async function PUT(request: Request) {
  return handle(async () => {
    const { role, permissionKey, allowed } = await readJson<{ role: MemberTier; permissionKey: string; allowed: boolean }>(request);
    return adminService.setPermission(role, permissionKey, Boolean(allowed));
  });
}

/** DELETE /api/admin/permissions — 모든 권한을 기본값으로 되돌림 */
export async function DELETE() {
  return handle(() => adminService.resetPermissions());
}
