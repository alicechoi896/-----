import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { analyticsService } from "@/lib/server/services/analytics";

export const maxDuration = 120;

/** GET /api/analytics/youtube?refresh=1 — v0.9.151 내 유튜브 영상 + 특징별 배수 (30분 기억, 50개당 1 unit) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("analytics");
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return analyticsService.myVideos(refresh);
  });
}

/**
 * POST /api/analytics/youtube { action, ... } — 누를 때만 1번 (자동 재시도 없음)
 * action: hypotheses (AI) · competitor (YouTube) · compare (AI) · hookSources · hookLab (AI) · saveHooks
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("analytics");
    const b = await readJson<{ action?: string; channel?: unknown; urls?: unknown; theirs?: unknown; mine?: unknown; hooks?: unknown; topic?: unknown; formatId?: unknown }>(request);
    switch (b.action) {
      case "hypotheses":
        return analyticsService.hypotheses();
      case "competitor":
        return analyticsService.competitor(b);
      case "compare":
        return analyticsService.compareHypotheses(b);
      case "hookSources":
        return analyticsService.hookSources();
      case "hookLab":
        return analyticsService.hookLab(b);
      case "saveHooks":
        return analyticsService.saveHooks(b);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
