import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

/** GET /api/memory — AI 학습 관리 개요 (항목별 개수) */
export async function GET() {
  return handle(() => memoryService.overview());
}
