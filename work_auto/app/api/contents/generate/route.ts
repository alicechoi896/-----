import { handle, readJson } from "@/lib/server/http";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import type { GenerateContentRequest } from "@/lib/types";

/** POST /api/contents/generate { featureId, input } — 모든 생성형 기능의 단일 진입점 */
export async function POST(request: Request) {
  return handle(async () => contentGenerationService.generate(await readJson<GenerateContentRequest>(request)));
}
