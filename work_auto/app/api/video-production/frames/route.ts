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

/** PUT /api/video-production/frames { videoId, edit | null } — v0.9.165 영상 편집 설정(구간·기본 화면·시간별 확대) 저장 (외부 호출 없음). 예전 { frame } 도 받음 */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireVideoAccess("youtube");
    return videoFrameService.set(await readJson<{ videoId?: unknown; edit?: unknown; frame?: unknown }>(request));
  });
}
