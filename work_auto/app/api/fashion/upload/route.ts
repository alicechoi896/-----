import { requireAccess } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/http";
import { fashionService as svc } from "@/lib/server/fashion/service";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** POST /api/fashion/upload?key= (본문 = 파일) — 데모(Supabase 없음)에서만. 실제는 Storage 에 직접 올린다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ig-fashion");
    if (isSupabaseConfigured()) throw new AppError("NOT_FOUND", "사용하지 않는 주소입니다.", 404);
    await svc.uploadMemory(new URL(request.url).searchParams.get("key") ?? "", await request.arrayBuffer());
    return { ok: true };
  });
}
