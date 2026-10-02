import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { adminService } from "@/lib/server/services/admin";

/** POST /api/admin/users/:userId/reject { reason? } — 가입 거절 (관리자 전용) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/admin/users/[userId]/reject">) {
  const { userId } = await ctx.params;
  return handle(async () => {
    const { reason } = await readJson<{ reason?: string }>(request).catch(() => ({ reason: undefined }));
    return adminService.reject(userId, reason);
  });
}
