import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaService } from "@/lib/server/drama/service";

/** POST /api/drama-test/upload — 인물 사진 올리기 (Kie 파일, 무료·24시간) → 전신·얼굴 확대 주소 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("ai-generate");
    return dramaService.upload(await readJson(request));
  });
}
