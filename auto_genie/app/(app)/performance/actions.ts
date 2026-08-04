"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { computePerformanceScore, computeRatios } from "@/lib/performance/scoring";
import { analyzePerformance } from "@/lib/ai/generate-performance-analysis";
import { applyPerformanceLearning, FEATURE_TO_WEIGHT_KEY, type FeatureScores } from "@/lib/strategy/scoring";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Database } from "@/types/database";

const metricsSchema = z.object({
  contentOutputId: z.string().uuid(),
  impressions: z.coerce.number().int().min(0).default(0),
  views: z.coerce.number().int().min(0).default(0),
  likes: z.coerce.number().int().min(0).default(0),
  comments: z.coerce.number().int().min(0).default(0),
  saves: z.coerce.number().int().min(0).default(0),
  clicks: z.coerce.number().int().min(0).default(0),
  inquiries: z.coerce.number().int().min(0).default(0),
  consultations: z.coerce.number().int().min(0).default(0),
  purchases: z.coerce.number().int().min(0).default(0),
  revenue: z.coerce.number().min(0).default(0),
  measuredAt: z.string().min(1),
});

export type PerformanceActionState = { error: string | null; recordId?: string };

export async function registerPerformanceAction(
  _prev: PerformanceActionState,
  formData: FormData
): Promise<PerformanceActionState> {
  const parsed = metricsSchema.safeParse({
    contentOutputId: formData.get("contentOutputId"),
    impressions: formData.get("impressions"),
    views: formData.get("views"),
    likes: formData.get("likes"),
    comments: formData.get("comments"),
    saves: formData.get("saves"),
    clicks: formData.get("clicks"),
    inquiries: formData.get("inquiries"),
    consultations: formData.get("consultations"),
    purchases: formData.get("purchases"),
    revenue: formData.get("revenue"),
    measuredAt: formData.get("measuredAt"),
  });
  if (!parsed.success) {
    return { error: "입력값을 확인하세요: " + parsed.error.issues[0]?.message };
  }

  const org = await requireCurrentOrganization();
  const limited = await checkRateLimit(`performance:${org.id}`, 30);
  if (!limited.ok) return { error: limited.message };

  const supabase = await createClient();

  const { data: output } = await supabase
    .from("content_outputs")
    .select("*, content_projects(*, campaigns(goal), strategy_options(*))")
    .eq("id", parsed.data.contentOutputId)
    .eq("organization_id", org.id)
    .single();
  if (!output) return { error: "콘텐츠를 찾을 수 없습니다." };

  const project = (
    output as unknown as {
      content_projects: (Database["public"]["Tables"]["content_projects"]["Row"] & {
        campaigns: { goal: Database["public"]["Tables"]["campaigns"]["Row"]["goal"] } | null;
        strategy_options: Database["public"]["Tables"]["strategy_options"]["Row"] | null;
      }) | null;
    }
  ).content_projects;

  const goal = project?.campaigns?.goal ?? null;
  const strategyOption = project?.strategy_options ?? null;

  const ratios = computeRatios(parsed.data);
  const performanceScore = computePerformanceScore(ratios, goal);

  const { data: record, error: insertError } = await supabase
    .from("performance_records")
    .insert({
      organization_id: org.id,
      content_output_id: parsed.data.contentOutputId,
      impressions: parsed.data.impressions,
      views: parsed.data.views,
      likes: parsed.data.likes,
      comments: parsed.data.comments,
      saves: parsed.data.saves,
      clicks: parsed.data.clicks,
      inquiries: parsed.data.inquiries,
      consultations: parsed.data.consultations,
      purchases: parsed.data.purchases,
      revenue: parsed.data.revenue,
      performance_score: performanceScore,
      measured_at: parsed.data.measuredAt,
    })
    .select("id")
    .single();

  if (insertError || !record) return { error: "성과 저장에 실패했습니다: " + insertError?.message };

  // AI 분석 -----------------------------------------------------------------
  try {
    const { data: org2 } = await supabase.from("organizations").select("name").eq("id", org.id).single();
    const { data: brandProfile } = await supabase
      .from("brand_profiles")
      .select("core_message")
      .eq("organization_id", org.id)
      .maybeSingle();
    const { data: rules } = await supabase
      .from("decision_rules")
      .select("rule_name, action_text")
      .eq("organization_id", org.id)
      .eq("is_active", true)
      .limit(5);

    const { data: similarRecords } = await supabase
      .from("performance_records")
      .select("performance_score, content_outputs(title, platform)")
      .eq("organization_id", org.id)
      .neq("id", record.id)
      .not("performance_score", "is", null)
      .order("measured_at", { ascending: false })
      .limit(5);

    const analysis = await analyzePerformance({
      organizationName: org2?.name ?? "",
      contentTitle: output.title ?? "",
      platform: output.platform,
      strategyTitle: strategyOption?.title ?? null,
      coreMessage: strategyOption?.core_message ?? null,
      metrics: {
        impressions: parsed.data.impressions,
        views: parsed.data.views,
        likes: parsed.data.likes,
        comments: parsed.data.comments,
        saves: parsed.data.saves,
        clicks: parsed.data.clicks,
        inquiries: parsed.data.inquiries,
        consultations: parsed.data.consultations,
        purchases: parsed.data.purchases,
      },
      ratios,
      performanceScore,
      brandCoreMessage: brandProfile?.core_message ?? null,
      decisionRuleHints: (rules ?? []).map((r) => `${r.rule_name}: ${r.action_text}`),
      similarContentPerformance: (similarRecords ?? [])
        .map((r) => {
          const co = (r as unknown as { content_outputs: { title: string | null } | null }).content_outputs;
          return { title: co?.title ?? "제목 없음", score: r.performance_score ?? 0 };
        })
        .filter((c) => c.score > 0),
    });

    await supabase.from("learning_events").insert({
      organization_id: org.id,
      event_type: "performance_registered",
      target_type: "content_outputs",
      target_id: parsed.data.contentOutputId,
      before_state: null,
      after_state: { performanceScore, analysis },
      description: `"${output.title}" 콘텐츠 성과가 등록되었습니다 (${performanceScore}점).`,
    });

    // 선호 가중치 업데이트 (최대 ±0.05) -----------------------------------------
    if (strategyOption) {
      const scores = strategyOption.feature_scores as unknown as FeatureScores;
      const dominant = (Object.keys(scores) as (keyof FeatureScores)[]).reduce((a, b) =>
        (scores[b] ?? 0) > (scores[a] ?? 0) ? b : a
      );
      const weightKey = FEATURE_TO_WEIGHT_KEY[dominant];

      const { data: weights } = await supabase
        .from("preference_weights")
        .select("*")
        .eq("organization_id", org.id)
        .maybeSingle();

      if (weights) {
        const direction = performanceScore >= 60 ? 1 : -1;
        const { updated, change } = applyPerformanceLearning(weights, weightKey, direction);
        await supabase.from("preference_weights").update(updated).eq("organization_id", org.id);
        await supabase.from("learning_events").insert({
          organization_id: org.id,
          event_type: "preference_updated",
          target_type: "preference_weights",
          target_id: null,
          before_state: { [change.key]: change.before },
          after_state: { [change.key]: change.after },
          description: `성과 결과(${performanceScore}점)에 따라 ${change.key} 가중치를 조정했습니다.`,
        });
      }
    }
  } catch {
    // AI 분석 실패는 성과 등록 자체를 막지 않는다 — 숫자 데이터는 이미 저장됨
  }

  revalidatePath("/performance");
  revalidatePath("/dashboard");
  return { error: null, recordId: record.id };
}
