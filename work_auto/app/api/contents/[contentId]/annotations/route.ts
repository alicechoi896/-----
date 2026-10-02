import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { scheduleLearning } from "@/lib/server/services/learning";
import { memoryService } from "@/lib/server/services/memory";

export const maxDuration = 120; // 응답 후 학습 업데이트가 이어질 수 있다

/** PATCH /api/contents/:id/annotations { edit?: { key, value }, pick?: { key, values } } — 직접 수정·후보 선택 (학습 신호) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/contents/[contentId]/annotations">) {
  const { contentId } = await ctx.params;
  return handle(async () => {
    const updated = await memoryService.annotate(contentId, await readJson(request));
    scheduleLearning(contentId);
    return updated;
  });
}
