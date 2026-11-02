import { requireAdmin } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { connectionStatus, disconnect, uploadToYouTube, type UploadInput } from "@/lib/server/youtube/upload";

export const maxDuration = 300;

/** GET /api/youtube/upload — 연결 상태 */
export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return connectionStatus();
  });
}

/** POST /api/youtube/upload { jobId, title, description, tags, publishAt?, privacy?, confirmed } — v0.9.150 완성 영상 유튜브 업로드 (확인 후, 1번 = 1번) */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAdmin();
    const b = await readJson<UploadInput & { confirmed?: boolean }>(request);
    if (b.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [올리기]를 눌러 주세요.", 409);
    return uploadToYouTube(b, session);
  });
}

/** DELETE /api/youtube/upload — 연결 끊기 */
export async function DELETE() {
  return handle(async () => {
    await requireAdmin();
    await disconnect();
    return { ok: true };
  });
}
