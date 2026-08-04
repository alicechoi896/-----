"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_ORG_COOKIE } from "@/lib/auth";

const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

export type OnboardingActionState = { error: string | null };

export async function createOrganizationAction(
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> {
  const parsed = createOrgSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) {
    return { error: "기업명을 입력하세요." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.name,
    org_industry: parsed.data.industry ?? null,
    org_description: parsed.data.description ?? null,
  });

  if (error || !data) {
    return { error: "워크스페이스 생성에 실패했습니다: " + (error?.message ?? "unknown error") };
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, data.id, { httpOnly: true, sameSite: "lax", path: "/" });

  redirect("/dashboard");
}
