import type { NextRequest } from "next/server";
import { handle } from "@/lib/server/http";
import { connectionService } from "@/lib/server/services/connections";

/** POST /api/connections/:provider/test — 연결 테스트 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/connections/[provider]/test">) {
  const { provider } = await ctx.params;
  return handle(() => connectionService.test(provider));
}
