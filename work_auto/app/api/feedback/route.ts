import { handle, readJson } from "@/lib/server/http";
import { scheduleLearning } from "@/lib/server/services/learning";
import { memoryService } from "@/lib/server/services/memory";

export const maxDuration = 120; // 응답 후 학습 업데이트가 이어질 수 있다
import type { UserFeedbackInput } from "@/lib/types";

/** GET /api/feedback */
export async function GET() {
  return handle(() => memoryService.listFeedback());
}

/** POST /api/feedback { contentId, rating, reason?, editedOutput? } */
export async function POST(request: Request) {
  return handle(async () => {
    const feedback = await memoryService.addFeedback(await readJson<UserFeedbackInput>(request));
    scheduleLearning(feedback.contentId);
    return feedback;
  });
}
