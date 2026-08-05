import { createClient } from "@/lib/supabase/server";
import { requireScreenAccess } from "@/lib/access/route-access";
import { BrainClient } from "./brain-client";

export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const { org, mode } = await requireScreenAccess("/brain", tab ?? null);
  const supabase = await createClient();

  const [entitiesRes, relationsRes, rulesRes, brandRes, evidenceRes] = await Promise.all([
    supabase
      .from("knowledge_entities")
      .select("*")
      .eq("organization_id", org.id)
      .order("confidence_score", { ascending: false }),
    supabase.from("knowledge_relations").select("*").eq("organization_id", org.id),
    supabase
      .from("decision_rules")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
    supabase.from("brand_profiles").select("*").eq("organization_id", org.id).maybeSingle(),
    supabase.from("knowledge_evidence").select("*").eq("organization_id", org.id),
  ]);

  const evidenceRows = evidenceRes.data ?? [];
  const dataSourceIds = Array.from(new Set(evidenceRows.map((e) => e.data_source_id).filter((id): id is string => Boolean(id))));
  const chunkIds = Array.from(new Set(evidenceRows.map((e) => e.chunk_id).filter((id): id is string => Boolean(id))));

  const [dataSourcesRes, chunksRes] = await Promise.all([
    dataSourceIds.length
      ? supabase.from("data_sources").select("id, title, created_at").in("id", dataSourceIds)
      : Promise.resolve({ data: [] as { id: string; title: string; created_at: string }[] }),
    chunkIds.length
      ? supabase.from("document_chunks").select("id, content").in("id", chunkIds)
      : Promise.resolve({ data: [] as { id: string; content: string }[] }),
  ]);

  const dataSourceById = new Map((dataSourcesRes.data ?? []).map((d) => [d.id, d]));
  const chunkById = new Map((chunksRes.data ?? []).map((c) => [c.id, c]));

  const evidence = evidenceRows.map((e) => ({
    ...e,
    data_sources: e.data_source_id ? dataSourceById.get(e.data_source_id) ?? null : null,
    document_chunks: e.chunk_id ? chunkById.get(e.chunk_id) ?? null : null,
  }));

  return (
    <BrainClient
      entities={entitiesRes.data ?? []}
      relations={relationsRes.data ?? []}
      decisionRules={rulesRes.data ?? []}
      brandProfile={brandRes.data ?? null}
      evidence={evidence}
      screenMode={mode}
    />
  );
}
