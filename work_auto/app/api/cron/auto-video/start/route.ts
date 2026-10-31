import { NextResponse } from "next/server";
import { automationConfigured, runAsAutomation } from "@/lib/server/automation/context";
import { readSettings, startRun, tick } from "@/lib/server/automation/auto-video";

/** v0.9.125: 고른 뒤 같은 실행 안에서 바로 만든다 (5분 크론을 기다리지 않음) */
export const maxDuration = 800;
/** 다음 1개를 시작해도 되는 시간 (1개 약 3~5분, 함수 한도 800초) */
const START_BUDGET_MS = 420_000;
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
      // v0.9.125: 고르자마자 바로 만들기 — 시간이 남으면 다음 항목도 (나머지는 5분 크론이 이어서)
      const t0 = Date.now();
      let made = 0;
      while (Date.now() - t0 < START_BUDGET_MS) {
        const r = await tick(run.date, "schedule");
        if (!r.did) break;
        made++;
        if (!r.left) break;
      }
      return { date: run.date, items: run.items.length, made, note: run.note ?? null };
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[AutoVideo] start fail", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "실패" }, { status: 500 });
  }
}
