import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { styleTypeExamples } from "@/lib/server/services/style-type-examples";

export const maxDuration = 60;

/** POST /api/styles/type-examples { kind, types, tone?, existing? } — 고른 유형으로 예시 문장 10개 (AI). 저장하지 않는다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("ai-generate");
    return styleTypeExamples.generate(await readJson<{ kind: string; types: string[]; tone?: string; existing?: string[] }>(request));
  });
}
