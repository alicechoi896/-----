import { requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { errorLogService } from "@/lib/server/services/error-log";

/** POST /api/errors { message, stack, path } — 화면(브라우저) 오류 기록. 로그인 사용자만, 1분 20건 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    await rateLimit("client-errors");
    const body = await readJson<{ message?: string; stack?: string; path?: string }>(request);
    await errorLogService.capture({
      source: "client",
      message: String(body.message ?? "").slice(0, 1000) || "화면 오류",
      stack: String(body.stack ?? "").slice(0, 6000),
      path: String(body.path ?? "").slice(0, 300),
      method: "", // 화면 오류는 페이지 주소만
    });
    return { ok: true };
  });
}
