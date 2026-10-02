import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import type { GenerateContentRequest } from "@/lib/types";


/** 실제 AI 응답은 수십 초 걸릴 수 있어 함수 실행 시간을 늘린다 */
export const maxDuration = 120;

/** POST /api/contents/generate { featureId, input } — 모든 생성형 기능의 단일 진입점 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<GenerateContentRequest>(request);
    await requireAccess(String(body.featureId ?? "")); // 생성 기능마다 등급 권한 확인
    return contentGenerationService.generate(body);
  });
}
