import { requireAccess } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/http";
import { silenceCutService } from "@/lib/server/services/silence-cut";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** POST /api/tools/silence-cut/upload?key= (본문 = 영상) — 데모(Supabase 없음)에서만. 실제는 Storage 에 직접 올린다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("silence-cut");
    if (isSupabaseConfigured()) throw new AppError("NOT_FOUND", "사용하지 않는 주소입니다.", 404);
    await silenceCutService.uploadMemory(new URL(request.url).searchParams.get("key") ?? "", await request.arrayBuffer());
    return { ok: true };
  });
}
