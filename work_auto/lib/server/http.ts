import "server-only";
import type { ApiResult } from "@/lib/types";

/**
 * Route Handler 공통 응답 도우미.
 * 모든 API 는 { ok: true, data } 또는 { ok: false, error: { code, message } } 형태로 응답한다.
 */

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json({ ok: true, data } satisfies ApiResult<T>, init);
}

export function fail(code: string, message: string, status = 400) {
  return Response.json({ ok: false, error: { code, message } } satisfies ApiResult<never>, { status });
}

/** Route Handler 본문을 감싸 예외를 일관된 오류 응답으로 바꾼다 */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof AppError) {
      // 5xx(외부 AI·API 장애 등)는 오류 기록에 남긴다. 4xx 는 사용자 입력 문제라 남기지 않는다
      if (err.status >= 500) await captureError({ source: "server", error: err, code: err.code, status: err.status });
      return fail(err.code, err.message, err.status);
    }
    console.error("[api] unexpected error", err);
    await captureError({ source: "server", error: err, code: "INTERNAL", status: 500 });
    return fail("INTERNAL", "서버에서 처리 중 오류가 발생했습니다.", 500);
  }
}

/** 오류 기록 (순환 참조를 피하려고 필요할 때 불러온다). 실패해도 응답에는 영향 없음 */
async function captureError(input: import("./services/error-log").CaptureInput) {
  try {
    const { errorLogService } = await import("./services/error-log");
    await errorLogService.capture(input);
  } catch {
    /* 기록 실패는 무시 */
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AppError("BAD_JSON", "요청 본문이 올바른 JSON 이 아닙니다.");
  }
}

export function notFound(what: string): never {
  throw new AppError("NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`, 404);
}
