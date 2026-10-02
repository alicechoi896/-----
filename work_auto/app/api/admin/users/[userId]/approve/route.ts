import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";
import type { MemberRole } from "@/lib/types";

/** POST /api/admin/users/:userId/approve { role } — 가입 승인 (관리자 전용) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/users/[userId]/approve">) {
  const { userId } = await ctx.params;
  return handle(async () => {
    const { role } = await readJson<{ role: MemberRole }>(request);
    return adminService.approve(userId, role);
  });
}
