import { requireSession } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { publicationService } from "@/lib/server/services/publications";

/** GET /api/publications/status?ids=a,b — 생성 콘텐츠별 업로드 상태 (업로드 기록에서 계산) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireSession();
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return publicationService.statusFor(ids);
  });
}
