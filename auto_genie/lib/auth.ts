import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { OrgRole } from "@/types/database";

export const CURRENT_ORG_COOKIE = "auto_genie_current_org";

export interface CurrentOrganization {
  id: string;
  name: string;
  industry: string | null;
  role: OrgRole;
}

// If Supabase is unreachable (e.g. a paused free-tier project), getUser() can
// hang far longer than any user will wait instead of failing fast. Cap it so
// a dead backend renders the page as "signed out" quickly instead of stalling.
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

// Server pages routinely call requireUser()/getUserOrganizations()/
// requireCurrentOrganization() several times while rendering a single request
// (e.g. requireCurrentOrganization() itself calls both). Each supabase.auth.getUser()
// is a network round trip to the Supabase Auth API, not a local JWT decode, so without
// caching a single page load could fire it 3-4x. React's cache() dedupes it to once
// per request/render pass.
const getCachedUser = cache(async () => {
  const supabase = await createClient();
  try {
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
    return user;
  } catch {
    return null;
  }
});

/** Redirects to /login if there is no signed-in user. Returns the user otherwise. */
export async function requireUser() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function getUserOrganizations(): Promise<CurrentOrganization[]> {
  const user = await getCachedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, industry)")
    .eq("user_id", user.id);

  if (error || !data) return [];

  return data
    .filter((row) => row.organizations)
    .map((row) => ({
      id: (row.organizations as unknown as { id: string; name: string; industry: string | null }).id,
      name: (row.organizations as unknown as { id: string; name: string; industry: string | null }).name,
      industry: (row.organizations as unknown as { id: string; name: string; industry: string | null })
        .industry,
      role: row.role,
    }));
}

/**
 * Resolves the active organization from the `current_org` cookie, falling
 * back to the user's first organization. Redirects to /onboarding if the
 * user belongs to none. Redirects to /login if unauthenticated.
 */
export async function requireCurrentOrganization(): Promise<CurrentOrganization> {
  await requireUser();
  const orgs = await getUserOrganizations();

  if (orgs.length === 0) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;
  const found = orgs.find((org) => org.id === preferredId);
  return found ?? orgs[0];
}
