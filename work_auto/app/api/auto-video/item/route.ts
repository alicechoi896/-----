import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { relinkItemJob } from "@/lib/server/automation/auto-video";

/** PATCH /api/auto-video/item { date, itemId, jobId } — v0.9.138 편집해서 다시 만든 영상을 자동 제작 결과에 반영 (외부 호출 없음) */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireAccess("yt-auto-video");
    const b = await readJson<{ date?: string; itemId?: string; jobId?: string }>(request);
    return relinkItemJob(String(b.date ?? ""), String(b.itemId ?? ""), String(b.jobId ?? ""));
  });
}
