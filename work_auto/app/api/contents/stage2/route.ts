import { handle, readJson } from "@/lib/server/http";
import { requireAccess } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import { getCurrentUserId, getRepositories } from "@/lib/server/repositories";

export const maxDuration = 120;

/**
 * POST /api/contents/stage2 { stage1Id, title, hook, cta } — 고른 제목 1개 → 대본 3편·최종 키워드·태그·설명 (AI 1회, 플랫폼 API 0회).
 * 제목을 여러 개 고르면 화면이 제목마다 한 번씩 부른다 (실패한 제목만 다시 시도할 수 있게).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ stage1Id?: string; title?: string; hook?: string; cta?: string }>(request);
    const s1 = await getRepositories().contents.get(String(body.stage1Id ?? ""));
    if (s1 && s1.userId === (await getCurrentUserId())) await requireAccess(s1.featureId);
    await rateLimit("ai-generate");
    return contentGenerationService.stage2(body);
  });
}
