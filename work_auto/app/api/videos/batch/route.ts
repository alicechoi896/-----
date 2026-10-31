import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { videoService, type ImportMetaHint } from "@/lib/server/services/videos";
import { after } from "next/server";
import { captureUserRunner } from "@/lib/server/automation/context";
import { keepSources } from "@/lib/server/video/vault";


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
    const out = await videoService.importMany(items ?? urls ?? [], note, productId);
    // v0.9.134: 가져온 샤오홍슈 영상 원본을 응답 뒤 받아 계속 보관 (지금은 주소가 살아 있어 무료로 받을 수 있다)
    const ids = out.filter((x) => x.ok && x.video?.platform === "xiaohongshu").map((x) => x.video!.id);
    if (ids.length) {
      const runAs = await captureUserRunner();
      after(() => runAs(() => keepSources(ids)).catch(() => undefined));
    }
    return out;
  });
}
