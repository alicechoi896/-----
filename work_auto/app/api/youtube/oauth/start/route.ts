import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { authUrl } from "@/lib/server/youtube/upload";

/** GET /api/youtube/oauth/start — v0.9.150 구글 계정 연결 시작 (관리자). state 는 쿠키로 확인 */
export async function GET(request: Request) {
  await requireAdmin();
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(origin, state));
  res.cookies.set("yt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/youtube/oauth", maxAge: 600 });
  return res;
}
