import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { videoService, type ImportMetaHint } from "@/lib/server/services/videos";

export const maxDuration = 60;

/**
 * POST /api/videos/batch { items: [{ url, titleHint?, meta? }] | urls: string[], note?, productId? } — 여러 영상 한 번에 가져오기 (URL 별 성공·실패)
 * meta(작성자·길이·썸네일)는 영상 검색 결과에서 넘어온 값: 있으면 상세·Resolver API 없이 저장한다
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("video-import");
    const { items, urls, note, productId } = await readJson<{ items?: { url: string; titleHint?: string; meta?: ImportMetaHint }[]; urls?: string[]; note?: string; productId?: string | null }>(request);
    return videoService.importMany(items ?? urls ?? [], note, productId);
  });
}
