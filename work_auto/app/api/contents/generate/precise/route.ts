import { requireAccess } from "@/lib/server/auth";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { supportsPrecise } from "@/lib/generators/quality";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { contentGenerationService } from "@/lib/server/services/content-generation";
import type { GenerateContentRequest } from "@/lib/types";

/** AI 4회를 차례로 부르므로 함수 실행 시간을 넉넉히 */
export const maxDuration = 300;

/**
 * POST /api/contents/generate/precise { featureId, input } — 정밀 생성 (docs/QUALITY_MODES.md)
 * 응답은 한 줄에 JSON 하나씩 보내는 스트림(NDJSON):
 *   {"type":"stage","stage":"angles"} … {"type":"done","data":GeneratedContent} | {"type":"error","error":{code,message}}
 * 권한·호출 한도·정밀 생성 불가 기능 오류는 스트림을 열기 전에 일반 JSON 오류로 돌려준다.
 */
export async function POST(request: Request) {
  let body: GenerateContentRequest;
  try {
    body = await readJson<GenerateContentRequest>(request);
    await requireAccess(String(body.featureId ?? ""));
    const config = findGeneratorConfig(String(body.featureId ?? ""));
    if (!config || !supportsPrecise(config.outputs)) throw new AppError("VALIDATION", "정밀 생성은 영상·클립 원고에서만 쓸 수 있습니다.");
    await rateLimit("ai-generate");
  } catch (e) {
    return handle(async () => {
      throw e;
    });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const content = await contentGenerationService.generatePrecise(body, (stage) => send({ type: "stage", stage }));
        send({ type: "done", data: content });
      } catch (e) {
        // 오류 기록·메시지는 일반 API 와 같은 규칙 (handle 이 만든 응답 본문을 그대로 보낸다)
        const res = await handle(async () => {
          throw e;
        });
        const errBody = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
        send({ type: "error", error: errBody?.error ?? { code: "INTERNAL", message: "생성에 실패했습니다." } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
