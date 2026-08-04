import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";
import { PerformanceClient } from "./performance-client";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ contentOutputId?: string }>;
}) {
  const { contentOutputId } = await searchParams;
  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const [outputsRes, recordsRes, projectsRes, optionsRes, eventsRes, weightsRes] = await Promise.all([
    supabase
      .from("content_outputs")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("performance_records")
      .select("*")
      .eq("organization_id", org.id)
      .order("measured_at", { ascending: false }),
    supabase.from("content_projects").select("id, strategy_option_id").eq("organization_id", org.id),
    supabase.from("strategy_options").select("id, strategy_type, title").eq("organization_id", org.id),
    supabase
      .from("learning_events")
      .select("*")
      .eq("organization_id", org.id)
      .in("event_type", ["performance_registered", "preference_updated"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("preference_weights").select("*").eq("organization_id", org.id).maybeSingle(),
  ]);

  return (
    <PerformanceClient
      preselectedOutputId={contentOutputId ?? null}
      outputs={outputsRes.data ?? []}
      records={recordsRes.data ?? []}
      projects={projectsRes.data ?? []}
      strategyOptions={optionsRes.data ?? []}
      events={eventsRes.data ?? []}
      weights={weightsRes.data ?? null}
      approverEmail={user.email ?? "워크스페이스 소유자"}
    />
  );
}
