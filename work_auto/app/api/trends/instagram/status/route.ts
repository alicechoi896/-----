import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { instagramTrendService } from "@/lib/server/services/instagram-trends";

/** GET /api/trends/instagram/status — 공식 API·TikHub 연결 여부 (DB 만, 외부 호출 없음) */
export async function GET() {
  return handle(async () => {
    await requireAccess("ig-trends");
    return instagramTrendService.status();
  });
}
