import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

/** GET /api/performance — 콘텐츠별 성과 (V1: Mock/수동 입력) */
export async function GET() {
  return handle(() => memoryService.listPerformance());
}
