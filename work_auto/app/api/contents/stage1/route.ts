import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import type { GenerateContentRequest } from "@/lib/types";

export const maxDuration = 120;

/**
 * POST /api/contents/stage1 { featureId, input, clientRequestId } — 2단계 생성의 1단계 (영상·클립): 제목·Hook·CTA 후보
 * Keyword Intelligence(YouTube search 1·videos 1 / NAVER 블로그 검색 1·데이터랩 1)는 여기서만 부른다. docs/TWO_STAGE_CONTENT_GENERATION.md
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<GenerateContentRequest & { clientRequestId?: string }>(request);
    await requireAccess(String(body.featureId ?? ""));
    await rateLimit("ai-generate");
    return contentGenerationService.stage1(body);
  });
}
