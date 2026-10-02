import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import type { GenerateContentRequest } from "@/lib/types";

/** POST /api/contents/generate { featureId, input } — 모든 생성형 기능의 단일 진입점 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<GenerateContentRequest>(request);
    await requireAccess(String(body.featureId ?? "")); // 생성 기능마다 등급 권한 확인
    return contentGenerationService.generate(body);
  });
}
