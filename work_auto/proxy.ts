import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDemoBlocked, isSupabaseConfigured, supabaseEnv } from "@/lib/supabase/config";

/**
 * Next.js 16 의 proxy (이전 middleware).
 * 1) 모든 요청에서 Supabase 세션 쿠키를 갱신한다
 * 2) 로그인하지 않은 사용자가 화면에 들어오면 /login 으로 보낸다 (API 는 각 핸들러가 401 을 돌려준다)
 *
 * Supabase 가 응답하지 않으면 3초 후 그냥 통과시킨다. 화면은 (app)/layout.tsx 가 다시 확인한다.
 * Supabase 가 설정되지 않은 데모 모드에서는 아무것도 하지 않는다.
 */

const AUTH_TIMEOUT_MS = 3000;
/** 로그인하지 않아도 볼 수 있는 경로 */
const PUBLIC_PATHS = ["/login", "/auth/", "/forgot-password", "/reset-password", "/terms", "/privacy"];

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

/** 다음 단계(화면·API)로 넘기는 요청 헤더: 오류 기록이 "어디서" 났는지 알 수 있게 경로·메서드를 붙인다 */
function forward(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  headers.set("x-method", request.method);
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request: NextRequest) {
  let response = forward(request);
  if (isDemoBlocked()) {
    // 운영에서 Supabase 설정이 빠졌다 → 로그인 없는 데모로 열지 않고 멈춘다
    console.error("[proxy] Supabase 환경변수가 없어 사이트를 닫았습니다 (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 확인)");
    return new NextResponse("서비스 점검 중입니다. 잠시 후 다시 접속해 주세요.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward(request);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let loggedIn: boolean | null = null; // null = 확인 실패 (시간 초과 등)
  try {
    // getClaims(): 토큰을 로컬에서 검증 (만료가 가까우면 세션을 갱신하고 쿠키를 다시 쓴다). getUser() 보다 빠르다
    const { data } = await withTimeout(supabase.auth.getClaims(), AUTH_TIMEOUT_MS);
    loggedIn = Boolean(data?.claims?.sub);
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
