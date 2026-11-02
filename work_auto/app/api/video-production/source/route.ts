import { requireVideoAccess } from "@/lib/server/video/access";
import { handle } from "@/lib/server/http";
import { getCurrentUserId, getRepositories } from "@/lib/server/repositories";
import { videoStorage } from "@/lib/server/video/storage";
import { srcKeyOf } from "@/lib/server/video/vault";

/** GET /api/video-production/source?videoId= — v0.9.139 보관한 원본 미리보기 주소 (1시간, 외부 호출 없음). 보관 안 됐으면 url: null */
export async function GET(request: Request) {
  return handle(async () => {
    await requireVideoAccess(new URL(request.url).searchParams.get("channelId") ?? "youtube");
    const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
    const owner = await getCurrentUserId();
    const v = await getRepositories().videos.get(videoId);
    if (!v || v.userId !== owner) return { url: null };
    const url = await videoStorage.url(srcKeyOf(owner, v.id), { seconds: 3600 }).catch(() => null);
    return { url: url ?? null };
  });
}
