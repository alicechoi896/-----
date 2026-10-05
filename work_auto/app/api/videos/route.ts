import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

/** GET /api/videos?productId= — 참고 영상 목록 (productId=none: 제품 연결 안 된 영상, 없으면 전체) */
export async function GET(request: Request) {
  return handle(() => videoService.list({ productId: new URL(request.url).searchParams.get("productId") }));
}

/** POST /api/videos { url, note? } — 영상 메타데이터를 가져와 저장 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("video-import");
    const { url, note } = await readJson<{ url: string; note?: string }>(request);
    return videoService.import(url, note);
  });
}
