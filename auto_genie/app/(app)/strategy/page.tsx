import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { StrategyHomeClient } from "./strategy-home-client";

export default async function StrategyPage() {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const [campaignsRes, runsRes, optionsRes, productsRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
    supabase.from("strategy_runs").select("*").eq("organization_id", org.id),
    supabase.from("strategy_options").select("id, strategy_run_id, selected, final_score").eq("organization_id", org.id),
    supabase.from("knowledge_entities").select("id, name").eq("organization_id", org.id).eq("entity_type", "product"),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const runs = runsRes.data ?? [];
  const options = optionsRes.data ?? [];

  const summaries = campaigns.map((campaign) => {
    const campaignRuns = runs.filter((r) => r.campaign_id === campaign.id);
    const latestRun = campaignRuns.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const runOptions = latestRun ? options.filter((o) => o.strategy_run_id === latestRun.id) : [];
    const selected = runOptions.find((o) => o.selected);
    return {
      campaign,
      latestRunId: latestRun?.id ?? null,
      latestRunStatus: latestRun?.status ?? null,
      optionCount: runOptions.length,
      selectedFinalScore: selected?.final_score ?? null,
    };
  });

  return <StrategyHomeClient summaries={summaries} products={productsRes.data ?? []} />;
}
