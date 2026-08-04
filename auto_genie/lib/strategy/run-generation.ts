import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { embedQuery } from "@/lib/ai/embed";
import { generateStrategyOptions } from "@/lib/ai/generate-strategies";
import {
  computeBaseScore,
  computeEvidenceScore,
  computeFinalScore,
  computePreferenceScore,
  type PreferenceWeights,
} from "./scoring";

type Client = SupabaseClient<Database>;

export class StrategyGenerationError extends Error {}

async function getOrCreatePreferenceWeights(supabase: Client, organizationId: string): Promise<PreferenceWeights> {
  const { data: existing } = await supabase
    .from("preference_weights")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("preference_weights")
    .insert({ organization_id: organizationId })
    .select("*")
    .single();
  if (error || !created) throw new StrategyGenerationError("선호 가중치를 초기화할 수 없습니다.");
  return created;
}

/**
 * Runs the full "데이터 검색 → 전략 후보 생성" pipeline for a campaign:
 * vector search relevant chunks, gather decision rules + brand profile,
 * call the AI for candidate strategies, then compute every score
 * deterministically server-side before persisting.
 */
export async function generateStrategiesForCampaign(
  supabase: Client,
  organizationId: string,
  campaignId: string
): Promise<string> {
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*, knowledge_entities(name, summary)")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();
  if (campaignError || !campaign) throw new StrategyGenerationError("캠페인을 찾을 수 없습니다.");

  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("core_message, prohibited_expressions")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const { data: rules } = await supabase
    .from("decision_rules")
    .select("rule_name, condition_text, action_text, reason_text, rule_category")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(10);

  const productName =
    (campaign as unknown as { knowledge_entities?: { name: string } | null }).knowledge_entities?.name ?? null;

  const queryText = [campaign.name, productName, campaign.audience, campaign.current_problem, campaign.goal]
    .filter(Boolean)
    .join(" / ");

  const inputData = {
    productName,
    audience: campaign.audience,
    currentProblem: campaign.current_problem,
    extraConditions: campaign.extra_conditions,
  };

  const queryEmbedding = await embedQuery(queryText);

  const { data: matches, error: matchError } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_organization_id: organizationId,
    match_count: 12,
  });
  if (matchError) throw new StrategyGenerationError("벡터 검색에 실패했습니다: " + matchError.message);

  const chunkIds = (matches ?? []).map((m) => m.id);
  const dataSourceIds = Array.from(new Set((matches ?? []).map((m) => m.data_source_id)));
  const { data: dataSources } = dataSourceIds.length
    ? await supabase.from("data_sources").select("id, title").in("id", dataSourceIds)
    : { data: [] };
  const titleById = new Map((dataSources ?? []).map((d) => [d.id, d.title]));

  const chunksForAi = (matches ?? []).map((m, i) => ({
    index: i,
    content: m.content,
    dataSourceTitle: titleById.get(m.data_source_id) ?? "알 수 없는 자료",
    similarity: m.similarity,
  }));

  const activeRuleNames = new Set((rules ?? []).map((r) => r.rule_name));

  const runInsert = await supabase
    .from("strategy_runs")
    .insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      input_data: { queryText, campaign: inputData },
      retrieved_chunk_ids: chunkIds,
      model_name: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      status: "running",
    })
    .select("id")
    .single();
  if (runInsert.error || !runInsert.data) {
    throw new StrategyGenerationError("전략 실행 기록을 생성할 수 없습니다.");
  }
  const runId = runInsert.data.id;

  try {
    const aiStrategies = await generateStrategyOptions({
      organizationName: org?.name ?? "",
      campaign: {
        name: campaign.name,
        productName,
        audience: campaign.audience ?? "",
        currentProblem: campaign.current_problem ?? "",
        goal: campaign.goal,
        platforms: Array.isArray(campaign.platforms) ? (campaign.platforms as string[]) : [],
        extraConditions: campaign.extra_conditions,
      },
      chunks: chunksForAi,
      rules: (rules ?? []).map((r) => ({
        name: r.rule_name,
        condition: r.condition_text,
        action: r.action_text,
        reason: r.reason_text,
        category: r.rule_category,
      })),
      brandCoreMessage: brandProfile?.core_message ?? null,
    });

    if (aiStrategies.length === 0) {
      throw new StrategyGenerationError("AI가 전략을 생성하지 못했습니다.");
    }

    const weights = await getOrCreatePreferenceWeights(supabase, organizationId);
    const prohibited = Array.isArray(brandProfile?.prohibited_expressions)
      ? (brandProfile!.prohibited_expressions as string[])
      : [];

    const rows = aiStrategies.map((s) => {
      const baseScore = computeBaseScore(s.featureScores);
      const preferenceScore = computePreferenceScore(s.featureScores, weights);

      const citedIndexes = Array.from(new Set(s.evidenceChunkIndexes));
      const citedChunks = citedIndexes
        .map((idx) => chunksForAi.find((c) => c.index === idx))
        .filter((c): c is (typeof chunksForAi)[number] => Boolean(c));
      const avgSimilarity =
        citedChunks.length > 0
          ? citedChunks.reduce((sum, c) => sum + c.similarity, 0) / citedChunks.length
          : chunksForAi.length > 0
            ? chunksForAi.reduce((sum, c) => sum + c.similarity, 0) / chunksForAi.length
            : 0;
      const matchedRuleCount = s.appliedDecisionRuleNames.filter((n) => activeRuleNames.has(n)).length;

      const textToScan = `${s.title} ${s.summary} ${s.coreMessage} ${s.contentDirection}`;
      const conflictCount = prohibited.filter((p) => p && textToScan.includes(p)).length;

      const evidenceScore = computeEvidenceScore({
        sourceCount: citedChunks.length,
        avgSimilarity,
        matchedRuleCount,
        conflictCount,
      });
      const finalScore = computeFinalScore({ baseScore, preferenceScore, evidenceScore });

      return {
        organization_id: organizationId,
        strategy_run_id: runId,
        strategy_type: s.strategyType,
        title: s.title,
        summary: s.summary,
        target_problem: s.targetProblem,
        core_message: s.coreMessage,
        content_direction: s.contentDirection,
        funnel_step: s.funnelStep,
        feature_scores: s.featureScores,
        base_score: Math.round(baseScore * 100) / 100,
        preference_score: Math.round(preferenceScore * 100) / 100,
        evidence_score: Math.round(evidenceScore * 100) / 100,
        final_score: finalScore,
        reasoning: s.reasoning,
        evidence: {
          citedChunks: citedChunks.map((c) => ({
            dataSourceTitle: c.dataSourceTitle,
            excerpt: c.content.slice(0, 300),
            similarity: c.similarity,
          })),
          appliedRules: s.appliedDecisionRuleNames.filter((n) => activeRuleNames.has(n)),
          risks: s.risks,
          advantages: s.advantages,
          recommendedPlatforms: s.recommendedPlatforms,
          contentMix: s.contentMix,
          conflictCount,
        },
        selected: false,
      } satisfies Database["public"]["Tables"]["strategy_options"]["Insert"];
    });

    const { error: insertError } = await supabase.from("strategy_options").insert(rows);
    if (insertError) throw new StrategyGenerationError("전략 저장에 실패했습니다: " + insertError.message);

    await supabase.from("strategy_runs").update({ status: "completed" }).eq("id", runId);
    return runId;
  } catch (error) {
    await supabase.from("strategy_runs").update({ status: "failed" }).eq("id", runId);
    throw error;
  }
}
