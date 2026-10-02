import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { learningService } from "@/lib/server/services/learning";

/** GET /api/learning — 팀 공통 학습 프로필 6개 + 내 새 학습 데이터 수 */
export async function GET() {
  return handle(async () => {
    await requireAccess("ai-learning");
    return learningService.list();
  });
}
