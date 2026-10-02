import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { contentGenerationService } from "@/lib/server/services/content-generation";

/** 실제 AI 응답은 수십 초 걸릴 수 있어 함수 실행 시간을 늘린다 */
export const maxDuration = 120;

/** POST /api/contents/:id/regenerate { key } — 결과의 한 항목만 다른 것으로 다시 만든다 (AI 1회) */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/contents/[contentId]/regenerate">) {
  const { contentId } = await ctx.params;
  return handle(async () => {
    await requireSession();
    await rateLimit("ai-generate");
    const { key } = await readJson<{ key: string }>(request);
    return contentGenerationService.regenerateSection(contentId, String(key ?? ""));
  });
}
