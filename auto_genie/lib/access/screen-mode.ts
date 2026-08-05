import "server-only";
import { cookies } from "next/headers";
import type { OrgRole } from "@/types/database";

export const SCREEN_MODE_COOKIE = "genie_screen_mode";

export type ScreenMode = "user" | "technical";

// Central place to connect existing org roles to technical/admin screen-mode
// access. "owner" is the only elevated role that currently exists in this
// project (types/database.ts OrgRole); if a real admin/developer role is
// introduced later, add it here rather than hardcoding checks elsewhere.
const TECHNICAL_MODE_ROLES: readonly OrgRole[] = ["owner"];

export function canUseTechnicalMode(role: OrgRole): boolean {
  return TECHNICAL_MODE_ROLES.includes(role);
}

/**
 * Resolves the effective screen mode for the current request. The cookie is
 * only ever a UI preference — a member-role user (or a cookie forged/stale
 * from a previous session) can never get technical mode just by having the
 * cookie set, since the role is re-checked against the current organization
 * on every call.
 */
export async function resolveScreenMode(role: OrgRole): Promise<ScreenMode> {
  if (!canUseTechnicalMode(role)) return "user";
  const cookieStore = await cookies();
  return cookieStore.get(SCREEN_MODE_COOKIE)?.value === "technical" ? "technical" : "user";
}
