import { handle } from "@/lib/server/http";
import { connectionService } from "@/lib/server/services/connections";

/** GET /api/connections — 공개 DTO 만 반환 (암호문/평문 Key 없음) */
export async function GET() {
  return handle(() => connectionService.list());
}
