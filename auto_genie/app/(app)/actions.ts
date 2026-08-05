"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_ORG_COOKIE, requireCurrentOrganization } from "@/lib/auth";
import { SCREEN_MODE_COOKIE, canUseTechnicalMode, type ScreenMode } from "@/lib/access/screen-mode";

export async function switchOrganizationAction(organizationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    throw new Error("해당 워크스페이스에 접근할 수 없습니다.");
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SCREEN_MODE_COOKIE);
  redirect("/login");
}

export async function setScreenModeAction(mode: ScreenMode) {
  const org = await requireCurrentOrganization();
  if (mode === "technical" && !canUseTechnicalMode(org.role)) {
    throw new Error("관리자·기술 시연 모드 접근 권한이 없습니다.");
  }

  const cookieStore = await cookies();
  cookieStore.set(SCREEN_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");

  if (mode === "user") {
    redirect("/dashboard");
  }
}
