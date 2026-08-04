"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { generateStrategiesForCampaign, StrategyGenerationError } from "@/lib/strategy/run-generation";
import { applySelectionLearning } from "@/lib/strategy/scoring";
import { checkRateLimit } from "@/lib/rate-limit";

const campaignSchema = z.object({
  name: z.string().min(1).max(200),
  productEntityId: z.string().uuid().optional(),
  audience: z.string().min(1).max(500),
  currentProblem: z.string().min(1).max(1000),
  goal: z.enum(["awareness", "views", "saves", "inquiries", "consultations", "purchases"]),
  platforms: z.array(z.string()).min(1),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  extraConditions: z.string().max(1000).optional(),
});

export type CampaignActionState = { error: string | null; campaignId?: string };

export async function createCampaignAndGenerateAction(
  _prev: CampaignActionState,
  formData: FormData
): Promise<CampaignActionState> {
  const parsed = campaignSchema.safeParse({
    name: formData.get("name"),
    productEntityId: formData.get("productEntityId") || undefined,
    audience: formData.get("audience"),
    currentProblem: formData.get("currentProblem"),
    goal: formData.get("goal"),
    platforms: formData.getAll("platforms"),
    periodStart: formData.get("periodStart") || undefined,
    periodEnd: formData.get("periodEnd") || undefined,
    extraConditions: formData.get("extraConditions") || undefined,
  });

  if (!parsed.success) {
    return { error: "캠페인명, 고객, 현재 문제, 목표, 플랫폼을 정확히 입력하세요." };
  }

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`strategy:${org.id}`, 10);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: org.id,
      name: parsed.data.name,
      product_entity_id: parsed.data.productEntityId ?? null,
      audience: parsed.data.audience,
      current_problem: parsed.data.currentProblem,
      goal: parsed.data.goal,
      platforms: parsed.data.platforms,
      period_start: parsed.data.periodStart || null,
      period_end: parsed.data.periodEnd || null,
      extra_conditions: parsed.data.extraConditions ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return { error: "캠페인 생성에 실패했습니다: " + campaignError?.message };
  }

  try {
    await generateStrategiesForCampaign(supabase, org.id, campaign.id);
  } catch (error) {
    return {
      error: error instanceof StrategyGenerationError ? error.message : "전략 생성 중 오류가 발생했습니다.",
      campaignId: campaign.id,
    };
  }

  revalidatePath("/strategy");
  redirect(`/strategy/${campaign.id}`);
}

export async function regenerateStrategiesAction(campaignId: string): Promise<{ error: string | null }> {
  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`strategy:${org.id}`, 10);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();
  try {
    await generateStrategiesForCampaign(supabase, org.id, campaignId);
  } catch (error) {
    return { error: error instanceof StrategyGenerationError ? error.message : "전략 생성 중 오류가 발생했습니다." };
  }
  revalidatePath(`/strategy/${campaignId}`);
  return { error: null };
}

const selectSchema = z.object({
  strategyOptionId: z.string().uuid(),
  reasons: z.array(z.string()).default([]),
  customReason: z.string().max(500).optional(),
});

export async function selectStrategyAction(formData: FormData): Promise<{ error: string | null }> {
  const parsed = selectSchema.safeParse({
    strategyOptionId: formData.get("strategyOptionId"),
    reasons: formData.getAll("reasons"),
    customReason: formData.get("customReason") || undefined,
  });
  if (!parsed.success) return { error: "선택 정보를 확인하세요." };

  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: option, error: optionError } = await supabase
    .from("strategy_options")
    .select("*")
    .eq("id", parsed.data.strategyOptionId)
    .eq("organization_id", org.id)
    .single();
  if (optionError || !option) return { error: "전략을 찾을 수 없습니다." };

  await supabase
    .from("strategy_options")
    .update({ selected: false })
    .eq("strategy_run_id", option.strategy_run_id);

  const { error: updateError } = await supabase
    .from("strategy_options")
    .update({ selected: true })
    .eq("id", option.id);
  if (updateError) return { error: "전략 선택에 실패했습니다: " + updateError.message };

  const { data: weights } = await supabase
    .from("preference_weights")
    .select("*")
    .eq("organization_id", org.id)
    .maybeSingle();

  const reasons = parsed.data.customReason
    ? [...parsed.data.reasons, "직접 입력"]
    : parsed.data.reasons;

  if (weights) {
    const { updated, changes } = applySelectionLearning(weights, reasons);
    if (changes.length > 0) {
      await supabase
        .from("preference_weights")
        .update(updated)
        .eq("organization_id", org.id);

      await supabase.from("learning_events").insert({
        organization_id: org.id,
        event_type: "preference_updated",
        target_type: "preference_weights",
        target_id: null,
        before_state: Object.fromEntries(changes.map((c) => [c.key, c.before])),
        after_state: Object.fromEntries(changes.map((c) => [c.key, c.after])),
        description: `전략 선택 이유(${reasons.join(", ")})에 따라 선호 가중치를 학습했습니다.`,
      });
    }
  }

  await supabase.from("learning_events").insert({
    organization_id: org.id,
    event_type: "strategy_selected",
    target_type: "strategy_options",
    target_id: option.id,
    before_state: null,
    after_state: { title: option.title, finalScore: option.final_score },
    description:
      `"${option.title}" 전략을 선택했습니다.` +
      (parsed.data.customReason ? ` (사유: ${parsed.data.customReason})` : ""),
  });

  revalidatePath(`/strategy`);
  return { error: null };
}
