import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Service-role Supabase client. Bypasses RLS — never import from client code
 * or any module reachable from the browser bundle. Use only for trusted
 * server-side operations (pipeline jobs, seed scripts, admin routes) that
 * explicitly filter by organization_id themselves.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase service role is not configured");
  }
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
