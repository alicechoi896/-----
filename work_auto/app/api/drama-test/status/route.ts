import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { dramaService } from "@/lib/server/drama/service";

/** POST /api/drama-test/status — 상태 확인 (Kie recordInfo, 무료) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("drama-test");
    return dramaService.status(await readJson(request));
  });
}
