import { requireAccess } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/http";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { vaultUploadMemory } from "@/lib/server/video/vault";

/** POST /api/videos/vault/upload?key= — 데모(Supabase 없음)에서만. 실제는 Storage 에 직접 올린다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    if (isSupabaseConfigured()) throw new AppError("NOT_FOUND", "사용하지 않는 주소입니다.", 404);
    await vaultUploadMemory(new URL(request.url).searchParams.get("key") ?? "", await request.arrayBuffer());
    return { ok: true };
  });
}
