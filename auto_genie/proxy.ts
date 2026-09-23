import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";

// If Supabase is unreachable (e.g. a paused free-tier project), getUser()
// can hang far longer than any user will wait instead of failing fast. Cap
// it so a dead backend makes every page load slow/redirect quickly rather
// than stall — downstream requireUser()/requireCurrentOrganization() calls
// still redirect to /login on their own when there's no valid session.
const AUTH_CHECK_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth check timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Next.js 16 renamed middleware.ts -> proxy.ts (function middleware -> proxy).
 * This refreshes the Supabase auth session cookie on every request so server
 * components always see a valid session.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    if (request.nextUrl.pathname !== "/setup") {
      return NextResponse.redirect(new URL("/setup", request.url));
    }
    return response;
  }

  const supabase = createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  try {
    await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
  } catch {
    // Supabase unreachable or too slow to answer in time — proceed without
    // a verified session rather than hang the request; pages that need auth
    // will redirect to /login themselves.
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
