import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

export const maxDuration = 120;

/** GET /api/drama-studio/:id — 프로젝트 (진행 중 작업이 있으면 상태 확인 — 무료) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.get((await ctx.params).id);
  });
}

/** PATCH /api/drama-studio/:id { section, value } — 부분 저장 (자동·수동 저장) */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.patch((await ctx.params).id, await readJson(request));
  });
}
