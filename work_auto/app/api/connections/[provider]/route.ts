import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { connectionService } from "@/lib/server/services/connections";

type Ctx = RouteContext<"/api/connections/[provider]">;

/** PUT /api/connections/:provider { credentials } — 서버에서 암호화 저장 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { provider } = await ctx.params;
  return handle(async () => {
    const { credentials } = await readJson<{ credentials: unknown }>(request);
    return connectionService.connect(provider, credentials);
  });
}

/** DELETE /api/connections/:provider — 연결 해제 (자격증명 삭제) */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { provider } = await ctx.params;
  return handle(() => connectionService.disconnect(provider));
}
