import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { dramaService } from "@/lib/server/drama/service";

/** POST /api/drama-test/create — 시험 만들기 — 장면 × 모델 (각 Kie 1회 과금, 자동 재시도 없음) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("drama-test");
    await rateLimit("ai-generate");
    return dramaService.create(await readJson(request));
  });
}
