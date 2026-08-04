import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { currentModelNames } from "@/lib/ai/provider";
import { TechnologyClient, type LayerStats, type ProcessingJobRow } from "./technology-client";
import type { SourceType } from "@/types/database";

export default async function TechnologyPage() {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const [
    dataSourceTypesRes,
    dataSourceCountRes,
    performanceCountRes,
    chunkCountRes,
    embeddedChunkCountRes,
    entityCountRes,
    relationCountRes,
    ruleCountRes,
    preferenceWeightsRes,
    strategyRunCountRes,
    strategyOptionCountRes,
    contentOutputCountRes,
    learningEventCountRes,
    lastProcessingJobRes,
    recentJobsRes,
  ] = await Promise.all([
    supabase.from("data_sources").select("source_type").eq("organization_id", org.id),
    supabase.from("data_sources").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("performance_records").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("document_chunks").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase
      .from("document_chunks")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .not("embedding", "is", null),
    supabase.from("knowledge_entities").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("knowledge_relations").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("decision_rules").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("preference_weights").select("*").eq("organization_id", org.id).maybeSingle(),
    supabase.from("strategy_runs").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("strategy_options").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("content_outputs").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("learning_events").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase
      .from("processing_jobs")
      .select("completed_at")
      .eq("organization_id", org.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("processing_jobs")
      .select("id, job_type, status, current_step, progress, error_message, started_at, completed_at, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const sourceTypeCounts: Record<SourceType, number> = {
    url: 0,
    text: 0,
    pdf: 0,
    docx: 0,
    txt: 0,
    markdown: 0,
    performance: 0,
  };
  for (const row of dataSourceTypesRes.data ?? []) {
    sourceTypeCounts[row.source_type] = (sourceTypeCounts[row.source_type] ?? 0) + 1;
  }

  const stats: LayerStats = {
    dataSourceCount: dataSourceCountRes.count ?? 0,
    sourceTypeCounts,
    performanceRecordCount: performanceCountRes.count ?? 0,
    chunkCount: chunkCountRes.count ?? 0,
    embeddedChunkCount: embeddedChunkCountRes.count ?? 0,
    entityCount: entityCountRes.count ?? 0,
    relationCount: relationCountRes.count ?? 0,
    decisionRuleCount: ruleCountRes.count ?? 0,
    hasPreferenceWeights: Boolean(preferenceWeightsRes.data),
    strategyRunCount: strategyRunCountRes.count ?? 0,
    strategyOptionCount: strategyOptionCountRes.count ?? 0,
    contentOutputCount: contentOutputCountRes.count ?? 0,
    learningEventCount: learningEventCountRes.count ?? 0,
    lastProcessedAt: lastProcessingJobRes.data?.completed_at ?? null,
  };

  const recentJobs: ProcessingJobRow[] = recentJobsRes.data ?? [];

  return <TechnologyClient stats={stats} models={currentModelNames()} recentJobs={recentJobs} />;
}
