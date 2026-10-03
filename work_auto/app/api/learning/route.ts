import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { after } from "next/server";
import { learningService } from "@/lib/server/services/learning";
import { youtubeStatsService } from "@/lib/server/services/youtube-stats";

/** GET /api/learning — 팀 공통 학습 프로필 6개 + 내 새 학습 데이터 수 */
export async function GET() {
  return handle(async () => {
    await requireAccess("ai-learning");
    after(() => youtubeStatsService.collectDue().catch(() => [])); // 밀린 YouTube 성과 (응답 뒤)
    return learningService.list();
  });
}
