import "server-only";
import { redirect } from "next/navigation";
import { requireCurrentOrganization, type CurrentOrganization } from "@/lib/auth";
import { resolveScreenMode, type ScreenMode } from "./screen-mode";

export type RouteAudience = "shared" | "user" | "technical";

const DEFAULT_TAB = "__default__";

/**
 * Per-route (and, where a page has query-param tabs, per-tab) access level.
 * Most routes in this app are reused by both screen modes at different
 * content depth ("shared"); only routes/tabs with no general-user equivalent
 * are "technical". Kept as one central map so no page has to repeat this
 * logic — see AGENTS-provided spec section 7.
 */
const ROUTE_AUDIENCE: Record<string, RouteAudience | Record<string, RouteAudience>> = {
  "/dashboard": "shared",
  "/learning": {
    [DEFAULT_TAB]: "shared",
    register: "shared",
    list: "shared",
    quality: "shared",
    reference: "technical",
    pipeline: "technical",
  },
  "/brain": {
    [DEFAULT_TAB]: "shared",
    dna: "shared",
    "problem-map": "technical",
    "expert-map": "technical",
    graph: "technical",
    rules: "technical",
  },
  "/strategy": "shared",
  "/orchestrator": "shared",
  "/workflow": "shared",
  "/performance": {
    [DEFAULT_TAB]: "shared",
    overview: "shared",
    "ai-analysis": "shared",
    "rule-update": "technical",
    "before-after": "technical",
    "brain-history": "technical",
  },
  "/technology": "technical",
  "/settings": "shared",
};

export function resolveRouteAudience(pathname: string, tab: string | null): RouteAudience {
  const entry = ROUTE_AUDIENCE[pathname];
  if (!entry) return "shared";
  if (typeof entry === "string") return entry;
  return entry[tab ?? DEFAULT_TAB] ?? entry[DEFAULT_TAB] ?? "shared";
}

/**
 * Server-side guard every app/(app)/**\/page.tsx calls. Enforces route access
 * regardless of what the sidebar shows or hides — a general user pasting a
 * technical-only URL/tab directly is redirected home with a notice, never
 * silently shown the technical content.
 */
export async function requireScreenAccess(
  pathname: string,
  tab: string | null = null
): Promise<{ org: CurrentOrganization; mode: ScreenMode }> {
  const org = await requireCurrentOrganization();
  const mode = await resolveScreenMode(org.role);
  const audience = resolveRouteAudience(pathname, tab);

  if (audience === "technical" && mode !== "technical") {
    redirect("/dashboard?accessDenied=1");
  }

  return { org, mode };
}
