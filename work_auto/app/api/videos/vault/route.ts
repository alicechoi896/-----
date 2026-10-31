import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { vaultFetch, vaultStatus, vaultUploadUrl } from "@/lib/server/video/vault";

export const maxDuration = 120;

/** GET /api/videos/vault?ids=a,b — 영상 파일 보관 상태 (외부 호출 없음) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return vaultStatus(ids);
  });
}

/**
 * POST /api/videos/vault { videoId, url? } — 샤오홍슈에서 무료로 받아 보관 (url = 같은 영상의 새 공유 링크). TikHub 안 씀
 * POST /api/videos/vault { videoId, upload: { size, fileName } } — 직접 올릴 주소
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const b = await readJson<{ videoId?: string; url?: string; upload?: { size?: number; fileName?: string } }>(request);
    if (b.upload) return vaultUploadUrl(String(b.videoId ?? ""), Number(b.upload.size), String(b.upload.fileName ?? ""));
    await rateLimit("video-import");
    return vaultFetch(String(b.videoId ?? ""), b.url);
  });
}
