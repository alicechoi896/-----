import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { automationConfigured } from "@/lib/server/automation/context";
import { AUTO_LIMITS, eligibility, kstDate, removeItems, listRuns, readRun, readSettings, saveSettings, videoUrls } from "@/lib/server/automation/auto-video";

/** GET /api/auto-video?date=YYYY-MM-DD — 설정 + 그날 결과 (외부 호출 없음) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("yt-auto-video");
    const sp = new URL(request.url).searchParams;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("date") ?? "") ? sp.get("date")! : kstDate();
    const run = await readRun(date);
    return { settings: await readSettings(), dates: await listRuns(), date, today: kstDate(), run, urls: await videoUrls(run), limits: AUTO_LIMITS, eligibility: await eligibility().catch(() => null), ready: { automation: automationConfigured(), cron: Boolean(process.env.CRON_SECRET) } };
  });
}

/** DELETE /api/auto-video?date=YYYY-MM-DD&itemId= — 결과 지우기 (항목 하나 또는 그날 전체, 완성 영상 파일도) */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireAccess("yt-auto-video");
    const sp = new URL(request.url).searchParams;
    const date = sp.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError("VALIDATION", "날짜가 올바르지 않습니다.");
    return removeItems(date, sp.get("itemId") || undefined);
  });
}

/** PATCH /api/auto-video { enabled, count, length } — 설정 저장 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireAccess("yt-auto-video");
    return { settings: await saveSettings(await readJson(request), session.user.email) };
  });
}
