import { handle, readJson } from "@/lib/server/http";
import { videoService } from "@/lib/server/services/videos";

/** GET /api/videos — 참고 영상 목록 */
export async function GET() {
  return handle(() => videoService.list());
}

/** POST /api/videos { url, note? } — 영상 메타데이터를 가져와 저장 */
export async function POST(request: Request) {
  return handle(async () => {
    const { url, note } = await readJson<{ url: string; note?: string }>(request);
    return videoService.import(url, note);
  });
}
