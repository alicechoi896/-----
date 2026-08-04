import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { StrategyDetailClient } from "./strategy-detail-client";

export default async function StrategyDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", org.id)
    .single();

  if (!campaign) notFound();

  const { data: runs } = await supabase
    .from("strategy_runs")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestRun = runs?.[0] ?? null;

  const { data: options } = latestRun
    ? await supabase
        .from("strategy_options")
        .select("*")
        .eq("strategy_run_id", latestRun.id)
        .eq("organization_id", org.id)
        .order("final_score", { ascending: false })
    : { data: [] };

  return (
    <StrategyDetailClient
      campaign={campaign}
      runStatus={latestRun?.status ?? null}
      options={options ?? []}
    />
  );
}
