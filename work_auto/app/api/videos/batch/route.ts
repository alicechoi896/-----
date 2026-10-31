import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { videoService, type ImportMetaHint } from "@/lib/server/services/videos";
import { after } from "next/server";
import { vaultAfterImport } from "@/lib/server/video/vault";

export const maxDuration = 300;

/**
 * POST /api/videos/batch { items: [{ url, titleHint?, meta? }] | urls: string[], note?, productId? } — 여러 영상 한 번에 가져오기 (URL 별 성공·실패)
 * meta(작성자·길이·썸네일)는 영상 검색 결과에서 넘어온 값: 있으면 상세·Resolver API 없이 저장한다
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("video-import");
    const { items, urls, note, productId } = await readJson<{ items?: { url: string; titleHint?: string; meta?: ImportMetaHint }[]; urls?: string[]; note?: string; productId?: string | null }>(request);
    const results = await videoService.importMany(items ?? urls ?? [], note, productId);
    // v0.9.112: 링크 열쇠가 살아 있을 때 원본을 받아 보관 (무료 경로만, 응답 뒤)
    const made = results.flatMap((r) => (r.ok && r.video ? [r.video] : []));
    if (made.length) after(() => vaultAfterImport(made));
    return results;
  });
}
