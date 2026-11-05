import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { reelReadService } from "@/lib/server/reel-read/service";

export const maxDuration = 300;

/** GET /api/reel-read[?id=] — v0.9.175 릴스 읽기 기록 목록 / 하나 (장면 사진 주소 포함) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("reel-read");
    const id = new URL(request.url).searchParams.get("id");
    return id ? reelReadService.get(id) : reelReadService.list();
  });
}

/**
 * POST /api/reel-read { action, ... } — 누를 때만 (자동 재시도 없음)
 * upload-url(직접 올리기, 무료) · url(인스타그램 주소 → TikHub 1회, confirmed 필수) · read(받아쓰기 + AI 1번) · format(대본 포맷에 담기) · remove
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("reel-read");
    const b = await readJson<{ action?: string; id?: unknown; name?: unknown; size?: unknown; url?: unknown; confirmed?: unknown; field?: unknown; formatId?: unknown; newFormat?: { name?: unknown; contentType?: unknown } | null }>(request);
    switch (b.action) {
      case "upload-url":
        return reelReadService.uploadUrl(b);
      case "url":
        return reelReadService.fromUrl(b);
      case "read":
        await rateLimit("ai-generate");
        return reelReadService.read(b);
      case "format":
        return reelReadService.toFormat(b);
      case "remove":
        return reelReadService.remove(b.id);
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
