import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/** Browser Supabase client. Only call when env is configured (see isSupabaseConfigured). */
export function createClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Supabase is not configured");
  }
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
