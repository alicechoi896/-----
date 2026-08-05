import { createClient } from "@/lib/supabase/server";
import { requireScreenAccess } from "@/lib/access/route-access";
import { ensureContentProjectAction } from "./actions";
import { OrchestratorClient } from "./orchestrator-client";
import { ProjectListClient } from "./project-list-client";

export default async function OrchestratorPage({
  searchParams,
}: {
  searchParams: Promise<{ strategyOptionId?: string; projectId?: string }>;
}) {
  const { strategyOptionId, projectId: projectIdParam } = await searchParams;
  const { org, mode } = await requireScreenAccess("/orchestrator");
  const supabase = await createClient();

  let projectId = projectIdParam ?? null;

  if (!projectId && strategyOptionId) {
    const result = await ensureContentProjectAction(strategyOptionId);
    projectId = result.projectId;
  }

  if (!projectId) {
    const { data: projects } = await supabase
      .from("content_projects")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false });

    return <ProjectListClient projects={projects ?? []} screenMode={mode} />;
  }

  const [projectRes, outputsRes] = await Promise.all([
    supabase.from("content_projects").select("*").eq("id", projectId).eq("organization_id", org.id).single(),
    supabase
      .from("content_outputs")
      .select("*")
      .eq("content_project_id", projectId)
      .eq("organization_id", org.id),
  ]);

  if (!projectRes.data) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto">
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
          콘텐츠 프로젝트를 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  return <OrchestratorClient project={projectRes.data} outputs={outputsRes.data ?? []} screenMode={mode} />;
}
