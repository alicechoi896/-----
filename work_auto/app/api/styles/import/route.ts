import { requireAccess } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { previewStyleImport } from "@/lib/server/services/style-import";
import { STYLE_IMPORT_MAX_BYTES } from "@/lib/style-limits";

/**
 * POST /api/styles/import (multipart: file, target) — 나의 스타일 파일 일괄 추가 "미리보기".
 * 파일은 이 요청의 메모리 안에서만 읽고 버린다 (디스크·DB 에 파일을 저장하지 않는다).
 * 저장은 사용자가 미리보기를 확인한 뒤 기존 스타일 저장 API 로 한다.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("style-import");
    // 본문을 읽기 전에 크기부터 본다 (multipart 머리 부분 여유 64KB)
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > STYLE_IMPORT_MAX_BYTES + 64 * 1024) throw new AppError("FILE_TOO_LARGE", "1MB 이하 파일만 올릴 수 있습니다.", 413);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("VALIDATION", "파일을 올려 주세요.");
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("VALIDATION", "파일을 읽지 못했습니다. 다시 올려 주세요.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "파일을 올려 주세요.");
    const target = form.get("target");
    return previewStyleImport(file, typeof target === "string" ? target : null);
  });
}
