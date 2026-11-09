import { NextResponse } from "next/server";
import { automationConfigured, runAsAutomation } from "@/lib/server/automation/context";
import { getCurrentUserId } from "@/lib/server/repositories";
import { videoJobService } from "@/lib/server/video/service";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cleanup — v0.9.187 매시간 저장 공간 정리 (자동화 계정 권한):
 * 다운로드한 지 1시간 지난 완성 영상 · 7일 지난 완성 영상 · 받은 지 7일 지난 원본 · 원본 합계 3GB 초과분.
 * 화면을 열 때(원고로 영상 만들기 목록)도 같은 정리가 돈다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  if (!automationConfigured() && process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.json({ ok: true, skipped: "자동화 계정 미설정" });
  try {
    await runAsAutomation(async () => videoJobService.cleanup(await getCurrentUserId()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[Cleanup] cron fail", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "실패" }, { status: 500 });
  }
}
