import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";

/** GET /api/fashion — 내 패션 프로젝트 (외부 호출 0) */
export async function GET() {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return { ...svc.meta(), ...(await svc.list()) };
  });
}

/** POST /api/fashion { title, theme } — 새 프로젝트 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    return svc.create(await readJson(request));
  });
}
