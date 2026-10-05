import { handle } from "@/lib/server/http";
import { memoryService } from "@/lib/server/services/memory";

/** GET /api/performance/prompts — 프롬프트 버전별 성과표 (내 생성 이력 기준, 저장 없음) */
export async function GET() {
  return handle(() => memoryService.promptStats());
}
