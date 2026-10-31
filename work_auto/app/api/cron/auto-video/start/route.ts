import { NextResponse } from "next/server";
import { automationConfigured, runAsAutomation } from "@/lib/server/automation/context";
import { readSettings, startRun } from "@/lib/server/automation/auto-video";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel 크론만: Authorization: Bearer CRON_SECRET (환경변수). 없거나 다르면 거절 */
function allowed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** GET /api/cron/auto-video/start — 매일 05:00 KST: 오늘 만들 제품 고르기 (자동화 계정 권한, 켜져 있을 때만) */
export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  // 자동화 계정을 아직 넣지 않았으면 조용히 건너뜀 (오류 기록을 쌓지 않게)
  if (!automationConfigured() && process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true, skipped: "자동화 계정 미설정" });
  try {
    const r = await runAsAutomation(async () => {
      const s = await readSettings();
      if (!s.enabled) return { skipped: "꺼져 있음" };
      const run = await startRun();
      return { date: run.date, items: run.items.length, note: run.note ?? null };
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[AutoVideo] start fail", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "실패" }, { status: 500 });
  }
}
