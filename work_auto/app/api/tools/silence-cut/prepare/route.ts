import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { silenceCutService } from "@/lib/server/services/silence-cut";

/** POST /api/tools/silence-cut/prepare { fileName, size } — 영상을 직접 올릴 주소 (Supabase Storage) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("silence-cut");
    return silenceCutService.prepare(await readJson(request));
  });
}
