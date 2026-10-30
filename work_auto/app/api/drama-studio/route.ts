import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

/** GET /api/drama-studio — 모델 목록 + 내 드라마 프로젝트 (외부 호출 0) */
export async function GET() {
  return handle(async () => {
    await requireAccess("drama-test");
    return { ...svc.meta(), ...(await svc.list()) };
  });
}

/** POST /api/drama-studio { title, settings, startStep } — 새 프로젝트 (중간부터 시작 가능) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("drama-test");
    return svc.create(await readJson(request));
  });
}
