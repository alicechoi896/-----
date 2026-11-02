import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { keepSource, relinkVideo, storedVideoIds, tikhubUsageToday } from "@/lib/server/video/vault";

export const maxDuration = 60;

/** GET /api/videos/vault — 오늘 TikHub 사용 횟수 / 한도 (외부 호출 없음) */
export async function GET() {
  return handle(async () => {
    await requireAccess("video-import");
    return { ...(await tikhubUsageToday()), stored: [...(await storedVideoIds())] };
  });
}

/**
 * POST /api/videos/vault { videoId, url } — 같은 영상의 공유 링크(xhslink)를 직접 넣기 (무료, TikHub 안 씀)
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const b = await readJson<{ videoId?: string; url?: string; tikhub?: boolean; confirmed?: boolean }>(request);
    // v0.9.127: TikHub 로 영구 링크 받기는 뺐다 (응답에 xhslink 가 없음 — 비용만 들었다)
    // v0.9.134: 원본 받아 보관 (무료 경로만)
    if ((b as { keep?: boolean }).keep) {
      // v0.9.141 paid = TikHub 로 받기 (확인 창 후에만)
      const paid = (b as { paid?: boolean }).paid === true;
      if (paid && b.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [받기]를 눌러 주세요.", 409);
      return keepSource(String(b.videoId ?? ""), { paid });
    }
    if (b.tikhub) throw new AppError("NOT_SUPPORTED", "TikHub 로는 영구 링크를 받을 수 없어 이 기능을 뺐습니다. 샤오홍슈 앱의 [공유] → 링크 복사 주소를 [공유 링크 직접 넣기]로 넣어 주세요.", 410);
    await rateLimit("video-import");
    return relinkVideo(String(b.videoId ?? ""), String(b.url ?? ""));
  });
}
