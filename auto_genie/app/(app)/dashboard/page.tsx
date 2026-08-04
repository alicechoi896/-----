import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentOrganization } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database as DbIcon,
  CheckCircle2,
  Layers,
  Sparkles,
  Scale,
  LayoutGrid,
  TrendingUp,
  Gauge,
  Info,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const org = await requireCurrentOrganization();
  const supabase = await createClient();

  const [
    sourcesRes,
    chunkCountRes,
    entityCountRes,
    ruleCountRes,
    contentCountRes,
    perfCountRes,
    brandRes,
    latestRunRes,
    recentJobsRes,
    recentContentRes,
    recentPerfRes,
    recentRulesRes,
  ] = await Promise.all([
    supabase.from("data_sources").select("*").eq("organization_id", org.id),
    supabase
      .from("document_chunks")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .not("embedding", "is", null),
    supabase.from("knowledge_entities").select("entity_type").eq("organization_id", org.id),
    supabase.from("decision_rules").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("content_outputs").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("performance_records").select("*", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("brand_profiles").select("core_message").eq("organization_id", org.id).maybeSingle(),
    supabase
      .from("strategy_options")
      .select("*")
      .eq("organization_id", org.id)
      .order("final_score", { ascending: false })
      .limit(1),
    supabase
      .from("processing_jobs")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("content_outputs")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("performance_records")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("decision_rules")
      .select("*")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const sources = sourcesRes.data ?? [];
  const entities = entityCountRes.data ?? [];
  const completedSources = sources.filter((s) => s.status === "completed").length;

  const hasProduct = entities.some((e) => e.entity_type === "product");
  const hasCustomerProblem = entities.some((e) => e.entity_type === "customer_problem");
  const hasExistingContent = sources.some((s) => {
    const meta = s.metadata as { category?: string } | null;
    return meta?.category === "기존 콘텐츠";
  });
  const hasBrandData = Boolean(brandRes.data?.core_message);
  const hasPerformanceData = (perfCountRes.count ?? 0) > 0;

  const checklist = [
    { label: "상품 데이터 보유", ok: hasProduct },
    { label: "고객 문제 데이터 보유", ok: hasCustomerProblem },
    { label: "기존 콘텐츠 보유", ok: hasExistingContent },
    { label: "브랜드 데이터 보유", ok: hasBrandData },
    { label: "성과 데이터 보유", ok: hasPerformanceData },
  ];
  const completeness = Math.round((checklist.filter((c) => c.ok).length / checklist.length) * 100);

  const topStrategy = latestRunRes.data?.[0] ?? null;

  const lastUpdated = sources
    .map((s) => s.updated_at)
    .sort()
    .reverse()[0];

  const metrics = [
    { label: "등록 데이터 수", value: sources.length, icon: DbIcon, color: "text-violet-600" },
    { label: "분석 완료 데이터 수", value: completedSources, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "저장된 벡터 청크 수", value: chunkCountRes.count ?? 0, icon: Layers, color: "text-sky-600" },
    { label: "추출된 지식 개체 수", value: entities.length, icon: Sparkles, color: "text-violet-600" },
    { label: "의사결정 규칙 수", value: ruleCountRes.count ?? 0, icon: Scale, color: "text-sky-600" },
    { label: "생성 콘텐츠 수", value: contentCountRes.count ?? 0, icon: LayoutGrid, color: "text-violet-600" },
    { label: "성과 데이터 수", value: perfCountRes.count ?? 0, icon: TrendingUp, color: "text-emerald-600" },
  ];

  return (
    <TooltipProvider>
      <div className="p-6 max-w-[1440px] mx-auto space-y-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">AI 컨트롤타워</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            기업의 데이터를 학습해 다음 마케팅 전략을 판단합니다.
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
            <span>워크스페이스: {org.name}</span>
            <span>·</span>
            <span>마지막 업데이트: {lastUpdated ? new Date(lastUpdated).toLocaleString("ko-KR") : "없음"}</span>
          </div>
          <div className="mt-4 flex gap-2">
            <Button asChild>
              <Link href="/learning">새 데이터 학습</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/strategy">새 전략 분석</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <m.icon className={`size-4 ${m.color}`} />
              <p className="mt-2 text-2xl font-semibold text-neutral-900">{m.value.toLocaleString()}</p>
              <p className="text-xs text-neutral-500">{m.label}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-center gap-1.5">
              <Gauge className="size-4 text-violet-600" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="size-3 text-neutral-400" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <ul className="text-xs space-y-0.5">
                    {checklist.map((c) => (
                      <li key={c.label}>
                        {c.ok ? "✓" : "✗"} {c.label}
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-2 text-2xl font-semibold text-violet-700">{completeness}%</p>
            <p className="text-xs text-neutral-500">AI 학습 완성도</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="font-medium text-neutral-900 mb-3">이번 주 AI 인사이트</p>
          {topStrategy ? (
            <div className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline">{topStrategy.strategy_type}</Badge>
                <p className="text-lg font-semibold text-violet-700">{topStrategy.final_score}점</p>
              </div>
              <p className="mt-2 font-medium text-neutral-900">{topStrategy.title}</p>
              <p className="mt-1 text-sm text-neutral-600">{topStrategy.reasoning}</p>
              <p className="mt-2 text-xs text-neutral-500">
                타깃 문제: {topStrategy.target_problem} · 근거 신뢰도 {topStrategy.evidence_score}
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href="/strategy">
                  전략 자세히 보기 <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-neutral-500 text-sm">
              아직 생성된 전략이 없습니다. 데이터를 등록하고 전략 분석을 시작하세요.
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <RecentPanel title="최근 학습 작업">
            {(recentJobsRes.data ?? []).map((j) => (
              <RecentRow key={j.id} primary={j.current_step ?? j.job_type} secondary={j.status} time={j.created_at} />
            ))}
          </RecentPanel>
          <RecentPanel title="최근 생성 콘텐츠">
            {(recentContentRes.data ?? []).map((c) => (
              <RecentRow key={c.id} primary={c.title ?? "제목 없음"} secondary={c.platform} time={c.created_at} />
            ))}
          </RecentPanel>
          <RecentPanel title="최근 성과 변화">
            {(recentPerfRes.data ?? []).map((p) => (
              <RecentRow
                key={p.id}
                primary={`성과 점수 ${p.performance_score ?? "-"}`}
                secondary={`조회 ${p.views} · 구매 ${p.purchases}`}
                time={p.created_at}
              />
            ))}
          </RecentPanel>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="font-medium text-neutral-900 mb-3">AI가 새로 학습한 규칙</p>
          <div className="space-y-2">
            {(recentRulesRes.data ?? []).map((r) => (
              <RecentRow key={r.id} primary={r.rule_name} secondary={r.action_text} time={r.created_at} />
            ))}
            {(recentRulesRes.data ?? []).length === 0 && (
              <p className="text-sm text-neutral-400">아직 학습된 규칙이 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function RecentPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="font-medium text-neutral-900 mb-3">{title}</p>
      <div className="space-y-2">
        {hasChildren ? children : <p className="text-sm text-neutral-400">최근 활동이 없습니다.</p>}
      </div>
    </div>
  );
}

function RecentRow({ primary, secondary, time }: { primary: string; secondary: string; time: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-neutral-50 pb-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-neutral-800">{primary}</p>
        <p className="truncate text-xs text-neutral-400">{secondary}</p>
      </div>
      <span className="shrink-0 text-xs text-neutral-400 ml-2">
        {new Date(time).toLocaleDateString("ko-KR")}
      </span>
    </div>
  );
}
