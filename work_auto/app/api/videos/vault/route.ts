import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { fetchShareLinkViaTikhub, relinkVideo, tikhubUsageToday } from "@/lib/server/video/vault";

export const maxDuration = 60;

/** GET /api/videos/vault — 오늘 TikHub 사용 횟수 / 한도 (외부 호출 없음) */
export async function GET() {
  return handle(async () => {
    await requireAccess("video-import");
    return tikhubUsageToday();
  });
}

/**
 * POST /api/videos/vault { videoId, url } — 같은 영상의 공유 링크(xhslink)를 직접 넣기 (무료, TikHub 안 씀)
 * POST /api/videos/vault { videoId, tikhub: true, confirmed: true } — TikHub 상세 1회(약 $0.01)로 영구 공유 링크 찾기 (하루 한도)
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const b = await readJson<{ videoId?: string; url?: string; tikhub?: boolean; confirmed?: boolean }>(request);
    if (b.tikhub) {
      if (b.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [받기]를 눌러 주세요.", 409);
      return fetchShareLinkViaTikhub(String(b.videoId ?? ""));
    }
    await rateLimit("video-import");
    return relinkVideo(String(b.videoId ?? ""), String(b.url ?? ""));
  });
}
