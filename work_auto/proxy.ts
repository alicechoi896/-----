import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/supabase/config";

/**
 * Next.js 16 의 proxy (이전 middleware).
 * 1) 모든 요청에서 Supabase 세션 쿠키를 갱신한다
 * 2) 로그인하지 않은 사용자가 화면에 들어오면 /login 으로 보낸다 (API 는 각 핸들러가 401 을 돌려준다)
 *
 * Supabase 가 응답하지 않으면 3초 후 그냥 통과시킨다. 화면은 (app)/layout.tsx 가 다시 확인한다.
 * Supabase 가 설정되지 않은 데모 모드에서는 아무것도 하지 않는다.
 */

const AUTH_TIMEOUT_MS = 3000;
const PUBLIC_PATHS = ["/login", "/auth/"];

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let loggedIn: boolean | null = null; // null = 확인 실패 (시간 초과 등)
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    loggedIn = Boolean(data.user);
  } catch {
    loggedIn = null;
  }

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));
  const isApi = pathname.startsWith("/api/");

  if (loggedIn === false && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)"],
};
