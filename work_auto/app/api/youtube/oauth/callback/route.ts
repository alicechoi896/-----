import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/server/auth";
import { finishConnect } from "@/lib/server/youtube/upload";

/** GET /api/youtube/oauth/callback?code&state — 구글이 돌려보낸 곳. 열쇠를 암호화해 저장하고 API 연결 센터로 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (msg: string) => NextResponse.redirect(`${url.origin}/settings/api?youtube=${encodeURIComponent(msg)}`);
  try {
    await requireAdmin();
    const jar = await cookies();
    if (!url.searchParams.get("state") || url.searchParams.get("state") !== jar.get("yt_oauth_state")?.value) return back("연결 확인값이 맞지 않습니다. 다시 눌러 주세요.");
    if (url.searchParams.get("error")) return back(`구글 연결을 취소했습니다 (${url.searchParams.get("error")}).`);
    const r = await finishConnect(url.origin, url.searchParams.get("code") ?? "");
    return back(`연결했습니다: ${r.channelTitle ?? "유튜브 채널"}`);
  } catch (e) {
    return back(e instanceof Error ? e.message.slice(0, 160) : "연결하지 못했습니다.");
  }
}
