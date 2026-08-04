import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization, requireUser } from "@/lib/auth";
import { WorkflowClient, type StageStatus, type WorkflowRun, type WorkflowStage } from "./workflow-client";
import type { Database } from "@/types/database";

type DataSource = Database["public"]["Tables"]["data_sources"]["Row"];
type StrategyRun = Database["public"]["Tables"]["strategy_runs"]["Row"];
type StrategyOption = Database["public"]["Tables"]["strategy_options"]["Row"];
type ContentProject = Database["public"]["Tables"]["content_projects"]["Row"];
type ContentOutput = Database["public"]["Tables"]["content_outputs"]["Row"];
type PerformanceRecord = Database["public"]["Tables"]["performance_records"]["Row"];
type LearningEvent = Database["public"]["Tables"]["learning_events"]["Row"];

function latestBy<T>(rows: T[], key: (row: T) => string): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => (key(a) < key(b) ? 1 : -1))[0];
}

function earliestBy<T>(rows: T[], key: (row: T) => string): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : 1))[0];
}

export default async function WorkflowPage() {
  const org = await requireCurrentOrganization();
  const user = await requireUser();
  const supabase = await createClient();

  const [campaignsRes, dataSourcesRes, strategyRunsRes, strategyOptionsRes, contentProjectsRes, contentOutputsRes, performanceRecordsRes, learningEventsRes] =
    await Promise.all([
      supabase.from("campaigns").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }),
      supabase.from("data_sources").select("*").eq("organization_id", org.id),
      supabase.from("strategy_runs").select("*").eq("organization_id", org.id),
      supabase.from("strategy_options").select("*").eq("organization_id", org.id),
      supabase.from("content_projects").select("*").eq("organization_id", org.id),
      supabase.from("content_outputs").select("*").eq("organization_id", org.id),
      supabase.from("performance_records").select("*").eq("organization_id", org.id),
      supabase.from("learning_events").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }),
    ]);

  const campaigns = campaignsRes.data ?? [];
  const dataSources: DataSource[] = dataSourcesRes.data ?? [];
  const strategyRuns: StrategyRun[] = strategyRunsRes.data ?? [];
  const strategyOptions: StrategyOption[] = strategyOptionsRes.data ?? [];
  const contentProjects: ContentProject[] = contentProjectsRes.data ?? [];
  const contentOutputs: ContentOutput[] = contentOutputsRes.data ?? [];
  const performanceRecords: PerformanceRecord[] = performanceRecordsRes.data ?? [];
  const learningEvents: LearningEvent[] = learningEventsRes.data ?? [];

  // Stage 1 & 2 (자료 등록 / AI 분석) are organization-wide: campaigns don't carry a
  // direct data_source foreign key, so every campaign shares the org's data foundation.
  const earliestSource = earliestBy(dataSources, (s) => s.created_at);
  const completedSources = dataSources.filter((s) => s.status === "completed");
  const failedSources = dataSources.filter((s) => s.status === "failed");
  const latestCompletedSource = latestBy(completedSources, (s) => s.updated_at);
  const latestFailedSource = latestBy(failedSources, (s) => s.updated_at);

  const orgRegistrationStage: WorkflowStage = {
    key: "registration",
    label: "자료 등록",
    status: dataSources.length === 0 ? "not_started" : "completed",
    timestamp: earliestSource?.created_at ?? null,
    detail: dataSources.length > 0 ? `${dataSources.length}건의 자료 등록됨` : null,
    actionHref: "/learning",
    actionLabel: "자료 등록하기",
  };

  const analysisStatus: StageStatus =
    dataSources.length === 0
      ? "not_started"
      : completedSources.length > 0
        ? "completed"
        : failedSources.length > 0
          ? "failed"
          : "in_progress";

  const orgAnalysisStage: WorkflowStage = {
    key: "analysis",
    label: "AI 분석",
    status: analysisStatus,
    timestamp:
      analysisStatus === "completed"
        ? (latestCompletedSource?.updated_at ?? null)
        : analysisStatus === "failed"
          ? (latestFailedSource?.updated_at ?? null)
          : null,
    detail:
      completedSources.length > 0
        ? `${completedSources.length}건 분석 완료`
        : failedSources.length > 0
          ? `${failedSources.length}건 분석 실패`
          : dataSources.length > 0
            ? "분석 진행 중"
            : null,
    actionHref: "/learning",
    actionLabel: "분석 실행하기",
  };

  const runs: WorkflowRun[] = campaigns.map((campaign) => {
    const runsForCampaign = strategyRuns.filter((r) => r.campaign_id === campaign.id);
    const latestRun = latestBy(runsForCampaign, (r) => r.created_at);
    const optionsForRun = latestRun ? strategyOptions.filter((o) => o.strategy_run_id === latestRun.id) : [];
    const selectedOption = optionsForRun.find((o) => o.selected) ?? null;

    const strategyGenStatus: StageStatus = !latestRun
      ? "not_started"
      : latestRun.status === "completed"
        ? "completed"
        : latestRun.status === "failed"
          ? "failed"
          : "in_progress";

    const strategyGenStage: WorkflowStage = {
      key: "strategy_generation",
      label: "전략 생성",
      status: strategyGenStatus,
      timestamp: latestRun?.created_at ?? null,
      detail: latestRun ? `${optionsForRun.length}개 전략안 생성` : null,
      actionHref: "/strategy",
      actionLabel: "전략 생성하기",
    };

    const approvalStatus: StageStatus = selectedOption
      ? "completed"
      : latestRun?.status === "failed"
        ? "failed"
        : optionsForRun.length > 0
          ? "in_progress"
          : "not_started";

    const approvalStage: WorkflowStage = {
      key: "strategy_approval",
      label: "전략 승인",
      status: approvalStatus,
      timestamp: selectedOption?.created_at ?? null,
      detail: selectedOption
        ? `"${selectedOption.title}" 승인됨`
        : optionsForRun.length > 0
          ? "승인 대기 중"
          : null,
      actionHref: "/strategy",
      actionLabel: "전략 승인하기",
    };

    const projectsForCampaign = contentProjects.filter(
      (p) => p.campaign_id === campaign.id || (selectedOption && p.strategy_option_id === selectedOption.id)
    );
    const projectIds = new Set(projectsForCampaign.map((p) => p.id));
    const outputsForCampaign = contentOutputs.filter((o) => projectIds.has(o.content_project_id));
    const latestOutput = latestBy(outputsForCampaign, (o) => o.created_at);
    const latestProject = latestBy(projectsForCampaign, (p) => p.created_at);

    const contentGenStatus: StageStatus =
      projectsForCampaign.length === 0 ? "not_started" : outputsForCampaign.length > 0 ? "completed" : "in_progress";

    const contentGenStage: WorkflowStage = {
      key: "content_generation",
      label: "콘텐츠 생성",
      status: contentGenStatus,
      timestamp: latestOutput?.created_at ?? latestProject?.created_at ?? null,
      detail:
        outputsForCampaign.length > 0
          ? `${outputsForCampaign.length}개 콘텐츠 생성됨 (${projectsForCampaign.length}개 프로젝트)`
          : projectsForCampaign.length > 0
            ? `${projectsForCampaign.length}개 프로젝트 생성됨`
            : null,
      actionHref: "/orchestrator",
      actionLabel: "콘텐츠 생성하기",
    };

    const reviewedOutputs = outputsForCampaign.filter((o) => o.status === "edited" || o.status === "final");
    const latestReviewed = latestBy(reviewedOutputs, (o) => o.updated_at);

    const reviewStatus: StageStatus =
      outputsForCampaign.length === 0 ? "not_started" : reviewedOutputs.length > 0 ? "completed" : "in_progress";

    const reviewStage: WorkflowStage = {
      key: "content_review",
      label: "콘텐츠 검수",
      status: reviewStatus,
      timestamp: latestReviewed?.updated_at ?? null,
      detail: reviewedOutputs.length > 0 ? `${reviewedOutputs.length}개 검수 완료` : outputsForCampaign.length > 0 ? "검수 대기 중" : null,
      actionHref: "/orchestrator",
      actionLabel: "콘텐츠 검수하기",
    };

    const outputIds = new Set(outputsForCampaign.map((o) => o.id));
    const performanceForCampaign = performanceRecords.filter((p) => outputIds.has(p.content_output_id));
    const latestPerformance = latestBy(performanceForCampaign, (p) => p.measured_at);

    const performanceStage: WorkflowStage = {
      key: "performance_input",
      label: "성과 입력",
      status: performanceForCampaign.length > 0 ? "completed" : "not_started",
      timestamp: latestPerformance?.measured_at ?? null,
      detail: performanceForCampaign.length > 0 ? `${performanceForCampaign.length}건 성과 기록` : null,
      actionHref: "/performance",
      actionLabel: "성과 입력하기",
    };

    const relevantLearningTargetIds = new Set<string>([
      ...optionsForRun.map((o) => o.id),
      ...outputsForCampaign.map((o) => o.id),
      ...performanceForCampaign.map((p) => p.id),
    ]);
    const learningForCampaign = learningEvents.filter((e) => e.target_id && relevantLearningTargetIds.has(e.target_id));
    const latestLearning = latestBy(learningForCampaign, (e) => e.created_at);

    const learningStage: WorkflowStage = {
      key: "learning_feedback",
      label: "AI 학습 반영",
      status: learningForCampaign.length > 0 ? "completed" : "not_started",
      timestamp: latestLearning?.created_at ?? null,
      detail: latestLearning?.description ?? (learningForCampaign.length > 0 ? `${learningForCampaign.length}건의 학습 이벤트` : null),
      actionHref: null,
      actionLabel: null,
    };

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignGoal: campaign.goal,
      campaignStatus: campaign.status,
      createdAt: campaign.created_at,
      stages: [
        orgRegistrationStage,
        orgAnalysisStage,
        strategyGenStage,
        approvalStage,
        contentGenStage,
        reviewStage,
        performanceStage,
        learningStage,
      ],
    };
  });

  const orgDataNote =
    dataSources.length > 0
      ? `'자료 등록'/'AI 분석' 단계는 캠페인별로 연결되지 않고 조직 전체 자료(${dataSources.length}건) 기준으로 표시됩니다.`
      : "'자료 등록'/'AI 분석' 단계는 조직 전체 자료 기준으로 표시됩니다. 아직 등록된 자료가 없습니다.";

  return <WorkflowClient userEmail={user.email ?? ""} runs={runs} orgDataNote={orgDataNote} />;
}
