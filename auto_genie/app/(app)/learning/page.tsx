import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { LearningClient } from "./learning-client";

// Kept outside the page component so the impure Date.now() read isn't
// attributed to (and flagged by react-hooks/purity within) the render path.
function ninetyDaysAgoCutoff(): number {
  return Date.now() - 90 * 24 * 60 * 60 * 1000;
}

export default async function LearningPage() {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const [sourcesRes, chunkCountRes, entityCountRes, relationCountRes, ruleCountRes, entitiesRes, evidenceRes, rulesRes] =
    await Promise.all([
      supabase
        .from("data_sources")
        .select("*")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_chunks")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .not("embedding", "is", null),
      supabase
        .from("knowledge_entities")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
      supabase
        .from("knowledge_relations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
      supabase
        .from("decision_rules")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id),
      supabase.from("knowledge_entities").select("id, name, entity_type, confidence_score").eq("organization_id", org.id),
      supabase.from("knowledge_evidence").select("entity_id").eq("organization_id", org.id),
      supabase
        .from("decision_rules")
        .select("id, rule_name, confidence_score")
        .eq("organization_id", org.id)
        .lt("confidence_score", 0.5),
    ]);

  const sources = sourcesRes.data ?? [];
  const extractedCount = sources.filter((s) => s.extracted_text || s.original_text).length;
  const chunkedSourceCount = sources.filter((s) =>
    ["chunking", "embedding", "analyzing", "completed"].includes(s.status)
  ).length;
  const failedCount = sources.filter((s) => s.status === "failed").length;
  const latestCompleted = sources
    .filter((s) => s.status === "completed")
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];

  const pipelineSummary = {
    sourceCount: sources.length,
    extractedCount,
    chunkedSourceCount,
    embeddedChunkCount: chunkCountRes.count ?? 0,
    entityCount: entityCountRes.count ?? 0,
    relationCount: relationCountRes.count ?? 0,
    ruleCount: ruleCountRes.count ?? 0,
    failedCount,
    latestCompletedAt: latestCompleted?.updated_at ?? null,
  };

  const entities = entitiesRes.data ?? [];
  const evidenceCounts = new Map<string, number>();
  for (const ev of evidenceRes.data ?? []) {
    evidenceCounts.set(ev.entity_id, (evidenceCounts.get(ev.entity_id) ?? 0) + 1);
  }

  const titleGroups = new Map<string, number>();
  for (const s of sources) titleGroups.set(s.title, (titleGroups.get(s.title) ?? 0) + 1);
  const duplicateTitles = sources.filter((s) => (titleGroups.get(s.title) ?? 0) > 1);

  const ninetyDaysAgo = ninetyDaysAgoCutoff();
  const staleSources = sources.filter(
    (s) => s.status === "completed" && new Date(s.created_at).getTime() < ninetyDaysAgo
  );

  const nameGroups = new Map<string, Set<string>>();
  for (const e of entities) {
    const set = nameGroups.get(e.name) ?? new Set<string>();
    set.add(e.entity_type);
    nameGroups.set(e.name, set);
  }
  const conflictingEntities = entities.filter((e) => (nameGroups.get(e.name)?.size ?? 0) > 1);

  const singleEvidenceEntities = entities.filter((e) => (evidenceCounts.get(e.id) ?? 0) === 1);
  const noEvidenceEntities = entities.filter((e) => (evidenceCounts.get(e.id) ?? 0) === 0);

  const quality = {
    duplicateSources: duplicateTitles.map((s) => ({ id: s.id, title: s.title })),
    staleSources: staleSources.map((s) => ({ id: s.id, title: s.title, createdAt: s.created_at })),
    conflictingEntities: conflictingEntities.map((e) => ({ id: e.id, name: e.name, entityType: e.entity_type })),
    singleEvidenceEntities: singleEvidenceEntities.map((e) => ({ id: e.id, name: e.name })),
    lowConfidenceRules: (rulesRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.rule_name,
      confidence: r.confidence_score,
    })),
    noEvidenceEntities: noEvidenceEntities.map((e) => ({ id: e.id, name: e.name })),
  };

  return (
    <LearningClient
      organizationId={org.id}
      sources={sources}
      pipelineSummary={pipelineSummary}
      quality={quality}
    />
  );
}
