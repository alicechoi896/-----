import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Server Supabase client bound to the request's cookies (RLS-scoped, respects the signed-in user).
 * Only call when env is configured (see isSupabaseConfigured).
 */
export async function createClient() {
  // cookies() must be called before any early throw so Next.js registers this
  // route as dynamic before bailing out — otherwise a misconfigured-env error
  // surfaces as a hard static-prerender build failure instead of a normal
  // request-time error.
  const cookieStore = await cookies();

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll called from a Server Component; ignored because proxy.ts refreshes sessions.
        }
      },
    },
  });
}
