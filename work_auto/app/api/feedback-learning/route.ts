import { requireSession } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { feedbackLearning } from "@/lib/server/ai/feedback-learning";

export const maxDuration = 120;

/** GET /api/feedback-learning — v0.9.164 받은 피드백 · 배운 규칙 · 효과 */
export async function GET() {
  return handle(async () => {
    await requireSession();
    return feedbackLearning.list();
  });
}

/**
 * POST /api/feedback-learning { action, ... }
 * up(👍) · critique(👎 고치고 배우기, AI 1번) · learn(규칙 배우기) · rule(켜고 끄기·고치기·지우기) · removeItem · cluster(자주 나오는 불만 묶기, AI 1번)
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    const b = await readJson<{ action?: string; contentId?: unknown; key?: unknown; item?: unknown; reasons?: unknown; note?: unknown; feedbackId?: unknown; text?: unknown; id?: unknown; on?: unknown; remove?: unknown }>(request);
    switch (b.action) {
      case "up":
        return feedbackLearning.up(b);
      case "critique":
        await rateLimit("ai-generate");
        return feedbackLearning.critique(b);
      case "learn":
        return feedbackLearning.learn(b);
      case "rule":
        return feedbackLearning.setRule(b);
      case "removeItem":
        return feedbackLearning.removeItem(b);
      case "cluster":
        await rateLimit("ai-generate");
        return feedbackLearning.cluster();
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
