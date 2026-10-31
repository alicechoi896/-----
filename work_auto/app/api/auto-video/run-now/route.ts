import { after } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { runWithoutPaidFallback } from "@/lib/server/automation/context";
import { AUTO_LIMITS, addItems, kstDate, patchItem, readRun, startRun, tick } from "@/lib/server/automation/auto-video";

export const maxDuration = 800;

/**
 * POST /api/auto-video/run-now { confirmed, count } — [지금 시험 실행]: 오늘 실행이 없으면 제품을 고르고(count 개),
 * 응답 뒤 1개를 바로 만든다 (로그인한 관리자 권한, TikHub 대체 경로 없음). AI·음성 비용이 들어 확인 후에만.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("yt-auto-video");
    await rateLimit("video-render");
    const body = (await readJson(request)) as { confirmed?: unknown; count?: unknown };
    if (body.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "비용이 드는 작업입니다. 확인 창에서 [실행]을 눌러 주세요.", 409);
    const date = kstDate();
    const count = Math.min(10, Math.max(1, Number(body.count) || 1));
    let run = (await readRun(date)) ?? (await runWithoutPaidFallback(() => startRun(date, count, "test")));
    // v0.9.119: 14분 넘게 멈춘 '만드는 중'(서버가 중간에 끊긴 경우)은 실패로 넘긴다
    const stuck = run.items.filter((x) => x.status === "running" && Date.now() - Date.parse(x.startedAt ?? run.createdAt) > AUTO_LIMITS.staleMs);
    for (const x of stuck) run = (await patchItem(date, x.id, { status: "failed", error: "중간에 끊겼습니다 (서버 재시작·시간 초과). 다시 만들어 주세요.", finishedAt: new Date().toISOString() })) ?? run;
    if (run.items.some((x) => x.status === "running")) throw new AppError("BUSY", "지금 만들고 있는 영상이 있습니다 (5~10분). 끝난 뒤 다시 눌러 주세요.", 409);
    // v0.9.110: 남은 항목이 없으면 새 제품을 골라 덧붙인다 (언제든 시험 실행)
    // 시험 항목이 남아 있지 않으면 새 제품을 골라 '시험'으로 덧붙인다 (새벽 자동 항목·새벽 자동 여부는 건드리지 않음)
    if (!run.items.some((x) => x.status === "pending" && x.source !== "schedule")) run = await runWithoutPaidFallback(() => addItems(date, count, "test"));
    after(() => runWithoutPaidFallback(() => tick(date, "test")).then(() => undefined));
    return { run };
  });
}
