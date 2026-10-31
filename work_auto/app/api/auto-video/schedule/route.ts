import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { patchItem, readRun } from "@/lib/server/automation/auto-video";
import { publicationService } from "@/lib/server/services/publications";

/** POST /api/auto-video/schedule { date, itemId, scheduledAt } — 확인한 영상을 업로드 관리에 YouTube 예약으로 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAccess("yt-auto-video");
    const b = (await readJson(request)) as { date?: string; itemId?: string; scheduledAt?: string };
    const run = await readRun(String(b.date ?? ""));
    const item = run?.items.find((x) => x.id === b.itemId);
    if (!run || !item || item.status !== "done" || !item.contentId) throw new AppError("NOT_FOUND", "완성된 영상을 찾지 못했습니다.", 404);
    const at = new Date(String(b.scheduledAt ?? ""));
    if (Number.isNaN(at.getTime())) throw new AppError("VALIDATION", "예약 시각을 골라 주세요.");
    const note = [item.description ? `[설명]\n${item.description}` : "", item.tags?.length ? `[태그] ${item.tags.join(", ")}` : ""].filter(Boolean).join("\n\n").slice(0, 1000);
    const pub = await publicationService.create(session, { contentId: item.contentId, platform: "youtube", title: item.title ?? undefined, status: "scheduled", scheduledAt: at.toISOString(), note });
    await patchItem(run.date, item.id, { publicationId: pub.id });
    return { publication: pub };
  });
}
