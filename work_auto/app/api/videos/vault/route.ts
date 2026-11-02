import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { keepSource, keepUploadUrl, storedVideoIds } from "@/lib/server/video/vault";

export const maxDuration = 60;

/** GET /api/videos/vault — 원본 보관한 영상 id (외부 호출 없음) */
export async function GET() {
  return handle(async () => {
    await requireAccess("video-import");
    return { stored: [...(await storedVideoIds())] };
  });
}

/**
 * POST /api/videos/vault { videoId, keepUpload, size } — [다운로드]로 브라우저가 받은 원본을 올릴 주소 (외부 호출 없음)
 * POST /api/videos/vault { videoId, keep: true } — 서버가 샤오홍슈에서 원본을 받아 보관 (무료 경로만, TikHub 안 씀)
 * v0.9.143: 공유 링크 직접 넣기·TikHub 영구 링크·TikHub 로 받기는 뺐다
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const b = await readJson<{ videoId?: string; keepUpload?: boolean; size?: number; keep?: boolean }>(request);
    if (b.keepUpload) return keepUploadUrl(String(b.videoId ?? ""), Number(b.size ?? 0));
    return keepSource(String(b.videoId ?? ""));
  });
}
