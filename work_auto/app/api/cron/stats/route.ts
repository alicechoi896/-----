import { NextResponse } from "next/server";
import { automationConfigured, runAsAutomation } from "@/lib/server/automation/context";
import { youtubeStatsService } from "@/lib/server/services/youtube-stats";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/stats — v0.9.149 매일 07:30 KST: 업로드 1일·7일 뒤 YouTube 성과(조회수·좋아요·댓글)를 자동으로 모은다 (자동화 계정 권한).
 * 화면을 열지 않아도 모이고, 모인 성과는 원고 생성의 '성과가 좋았던 콘텐츠'와 예시 고르기에 반영된다. YouTube 공식 API(무료 한도).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  if (!automationConfigured() && process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true, skipped: "자동화 계정 미설정" });
  try {
    const saved = await runAsAutomation(() => youtubeStatsService.collectDue());
    console.info("[Stats] cron", JSON.stringify({ saved: saved.length }));
    return NextResponse.json({ ok: true, saved: saved.length });
  } catch (e) {
    console.error("[Stats] cron fail", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "실패" }, { status: 500 });
  }
}
