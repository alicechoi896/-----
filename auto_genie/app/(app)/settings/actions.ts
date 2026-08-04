"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";

const updateOrgSchema = z.object({
  name: z.string().min(1).max(200),
  industry: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
});

export type SettingsActionState = { error: string | null };

export async function updateOrganizationAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const parsed = updateOrgSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: "기업명을 입력하세요." };

  const org = await requireCurrentOrganization();
  if (org.role !== "owner") return { error: "워크스페이스 소유자만 수정할 수 있습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      industry: parsed.data.industry ?? null,
      description: parsed.data.description ?? null,
    })
    .eq("id", org.id);

  if (error) return { error: "수정에 실패했습니다: " + error.message };

  revalidatePath("/settings");
  return { error: null };
}
