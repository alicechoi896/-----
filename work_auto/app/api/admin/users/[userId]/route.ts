import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";
import type { MemberRole } from "@/lib/types";

/** PATCH /api/admin/users/:userId { role } — 역할 변경 (관리자 전용) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/users/[userId]">) {
  const { userId } = await ctx.params;
  return handle(async () => {
    const { role } = await readJson<{ role: MemberRole }>(request);
    return adminService.updateRole(userId, role);
  });
}
