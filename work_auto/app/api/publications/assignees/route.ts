import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { publicationService } from "@/lib/server/services/publications";

/** GET /api/publications/assignees — 담당자 후보 (관리자: 승인된 직원 전체, 직원: 본인) */
export async function GET() {
  return handle(async () => publicationService.assignees(await requireAccess("uploads")));
}
