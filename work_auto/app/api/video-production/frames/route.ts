import { handle, readJson } from "@/lib/server/http";
import { requireVideoAccess } from "@/lib/server/video/access";
import { videoFrameService } from "@/lib/server/video/frames";

/** GET /api/video-production/frames — v0.9.161 영상별 기본 화면 (확대·위치) */
export async function GET() {
  return handle(async () => {
    await requireVideoAccess("youtube");
    return videoFrameService.list();
  });
}

/** PUT /api/video-production/frames { videoId, frame | null } — 영상 URL 가져오기에서 기본 화면 정하기 (외부 호출 없음) */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireVideoAccess("youtube");
    return videoFrameService.set(await readJson<{ videoId?: unknown; frame?: unknown }>(request));
  });
}
