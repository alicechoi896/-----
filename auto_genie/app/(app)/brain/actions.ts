"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";

const editEntitySchema = z.object({
  entityId: z.string().uuid(),
  summary: z.string().min(1).max(1000),
});

export async function editEntityAction(formData: FormData): Promise<{ error: string | null }> {
  const parsed = editEntitySchema.safeParse({
    entityId: formData.get("entityId"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) return { error: "수정 내용을 확인하세요." };

  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("knowledge_entities")
    .select("*")
    .eq("id", parsed.data.entityId)
    .eq("organization_id", org.id)
    .single();

  if (!before) return { error: "지식 개체를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("knowledge_entities")
    .update({ summary: parsed.data.summary })
    .eq("id", parsed.data.entityId)
    .eq("organization_id", org.id);

  if (error) return { error: "수정에 실패했습니다: " + error.message };

  await supabase.from("learning_events").insert({
    organization_id: org.id,
    event_type: "knowledge_edited",
    target_type: "knowledge_entities",
    target_id: parsed.data.entityId,
    before_state: { summary: before.summary },
    after_state: { summary: parsed.data.summary },
    description: `"${before.name}" 항목을 사용자가 직접 수정했습니다.`,
  });

  await supabase.from("audit_logs").insert({
    organization_id: org.id,
    user_id: user.id,
    action: "update",
    entity_type: "knowledge_entities",
    entity_id: parsed.data.entityId,
    metadata: { before: before.summary, after: parsed.data.summary },
  });

  revalidatePath("/brain");
  return { error: null };
}

const editBrandFieldSchema = z.object({
  field: z.enum(["core_message"]),
  value: z.string().max(500),
});

export async function editBrandProfileAction(formData: FormData): Promise<{ error: string | null }> {
  const parsed = editBrandFieldSchema.safeParse({
    field: formData.get("field"),
    value: formData.get("value"),
  });
  if (!parsed.success) return { error: "입력값을 확인하세요." };

  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("organization_id", org.id)
    .maybeSingle();

  const { error } = await supabase
    .from("brand_profiles")
    .upsert(
      { organization_id: org.id, core_message: parsed.data.value },
      { onConflict: "organization_id" }
    );

  if (error) return { error: "수정에 실패했습니다: " + error.message };

  await supabase.from("learning_events").insert({
    organization_id: org.id,
    event_type: "knowledge_edited",
    target_type: "brand_profiles",
    target_id: null,
    before_state: { core_message: before?.core_message ?? null },
    after_state: { core_message: parsed.data.value },
    description: "대표 메시지를 사용자가 직접 수정했습니다.",
  });

  await supabase.from("audit_logs").insert({
    organization_id: org.id,
    user_id: user.id,
    action: "update",
    entity_type: "brand_profiles",
    entity_id: null,
    metadata: { before: before?.core_message ?? null, after: parsed.data.value },
  });

  revalidatePath("/brain");
  return { error: null };
}

export async function toggleDecisionRuleAction(ruleId: string, isActive: boolean): Promise<void> {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();
  await supabase
    .from("decision_rules")
    .update({ is_active: isActive })
    .eq("id", ruleId)
    .eq("organization_id", org.id);
  revalidatePath("/brain");
}
