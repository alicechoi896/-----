import { NextResponse } from "next/server";
import { automationConfigured, runAsAutomation } from "@/lib/server/automation/context";
import { readSettings, tick } from "@/lib/server/automation/auto-video";

/** 영상 1개 (원고·컷 계획·렌더)를 이 함수 안에서 끝낸다 */
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/** Vercel 크론만: Authorization: Bearer CRON_SECRET (환경변수). 없거나 다르면 거절 */
function allowed(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

/** GET /api/cron/auto-video/tick — 05:05~07:55 KST 5분마다: 진행 중인 것이 없으면 다음 1개를 만든다 */
export async function GET(request: Request) {
  if (!allowed(request)) return NextResponse.json({ ok: false }, { status: 401 });
  // 자동화 계정을 아직 넣지 않았으면 조용히 건너뜀 (오류 기록을 쌓지 않게)
  if (!automationConfigured() && process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true, skipped: "자동화 계정 미설정" });
  try {
    const r = await runAsAutomation(async () => {
      const s = await readSettings();
      if (!s.enabled) return { skipped: "꺼져 있음" };
      return tick();
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[AutoVideo] tick fail", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "실패" }, { status: 500 });
  }
}
