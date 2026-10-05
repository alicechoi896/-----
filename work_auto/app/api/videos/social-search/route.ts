import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { socialSearchService } from "@/lib/server/services/social-search";

export const maxDuration = 60;

/**
 * POST /api/videos/social-search { keyword, platforms: ["xiaohongshu","douyin"], autoTranslate, sort, period, continue? }
 * 샤오홍슈·도우인 영상 검색 (TikHub, 저장하지 않음). 한국어 검색어는 기본 AI 로 한 번 변환. docs/SOCIAL_VIDEO_SOURCING.md
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    await rateLimit("xhs-search");
    return socialSearchService.search(await readJson(request));
  });
}
