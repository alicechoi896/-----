import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { automationConfigured } from "@/lib/server/automation/context";
import { AUTO_LIMITS, eligibility, kstDate, listRuns, readRun, readSettings, saveSettings, videoUrls } from "@/lib/server/automation/auto-video";

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

/** PATCH /api/auto-video { enabled, count, length } — 설정 저장 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const session = await requireAccess("yt-auto-video");
    return { settings: await saveSettings(await readJson(request), session.user.email) };
  });
}
