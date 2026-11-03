import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { saveRequestAsRule } from "@/lib/server/services/content-generation";

/** POST /api/contents/:id/format-rule { text } — v0.9.157 한 줄 요청을 이 원고의 대본 포맷 규칙으로 저장 (AI 호출 없음) */
export async function POST(request: NextRequest, ctx: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await ctx.params;
  return handle(async () => {
    await requireAccess("ai-learning");
    const { text } = await readJson<{ text?: string }>(request);
    return saveRequestAsRule(contentId, text);
  });
}
