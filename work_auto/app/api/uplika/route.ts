import { requireAdmin } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { uplikaAccounts, uplikaPostStatus, uplikaPublishJob, type UplikaPublishInput } from "@/lib/server/uplika/publish";

export const maxDuration = 300;

/**
 * GET /api/uplika — 업리카에 연결된 계정 (무료) · GET /api/uplika?postId=&pubs=a,b — 게시 상태 (무료)
 * POST /api/uplika { jobId, accountIds, caption, firstComment?, scheduledAt?, clientRequestId, confirmed } — v0.9.195 완성 영상 SNS 게시 (확인 후, 1번 = 1번)
 */
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireAdmin();
    const u = new URL(request.url);
    const postId = u.searchParams.get("postId");
    if (postId) return uplikaPostStatus(postId, (u.searchParams.get("pubs") ?? "").split(",").filter(Boolean).slice(0, 10), session);
    return uplikaAccounts();
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAdmin();
    const b = await readJson<UplikaPublishInput & { confirmed?: boolean }>(request);
    if (b.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [올리기]를 눌러 주세요.", 409);
    await rateLimit("uplika-publish");
    return uplikaPublishJob({ ...b, accountIds: Array.isArray(b.accountIds) ? b.accountIds.map(String).slice(0, 10) : [] }, session);
  });
}
