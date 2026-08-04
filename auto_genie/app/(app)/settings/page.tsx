import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";
import { currentModelNames } from "@/lib/ai/provider";
import { isAiConfigured, isSupabaseConfigured } from "@/lib/env";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", org.id);

  const models = isAiConfigured() ? currentModelNames() : null;

  return (
    <SettingsClient
      organization={org}
      userEmail={user.email ?? ""}
      memberCount={members?.length ?? 0}
      supabaseConfigured={isSupabaseConfigured()}
      aiConfigured={isAiConfigured()}
      models={models}
    />
  );
}
