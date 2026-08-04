"use client";

import { useActionState, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerPerformanceAction, type PerformanceActionState } from "./actions";
import type { Database } from "@/types/database";
import { Sparkles, TrendingUp, TrendingDown } from "lucide-react";

type ContentOutput = Database["public"]["Tables"]["content_outputs"]["Row"];
type PerformanceRecord = Database["public"]["Tables"]["performance_records"]["Row"];
type LearningEvent = Database["public"]["Tables"]["learning_events"]["Row"];

const METRIC_FIELDS: { name: string; label: string }[] = [
  { name: "impressions", label: "노출" },
  { name: "views", label: "조회" },
  { name: "likes", label: "좋아요" },
  { name: "comments", label: "댓글" },
  { name: "saves", label: "저장" },
  { name: "clicks", label: "클릭" },
  { name: "inquiries", label: "문의" },
  { name: "consultations", label: "상담" },
  { name: "purchases", label: "구매" },
  { name: "revenue", label: "매출" },
];

const initialState: PerformanceActionState = { error: null };

export function PerformanceClient({
  preselectedOutputId,
  outputs,
  records,
  projects,
  strategyOptions,
  events,
  weights,
}: {
  preselectedOutputId: string | null;
  outputs: ContentOutput[];
  records: PerformanceRecord[];
  projects: { id: string; strategy_option_id: string | null }[];
  strategyOptions: { id: string; strategy_type: string; title: string }[];
  events: LearningEvent[];
  weights: Database["public"]["Tables"]["preference_weights"]["Row"] | null;
}) {
  const outputById = useMemo(() => new Map(outputs.map((o) => [o.id, o])), [outputs]);
  const strategyTypeByProject = useMemo(() => {
    const optionById = new Map(strategyOptions.map((o) => [o.id, o]));
    return new Map(
      projects.map((p) => [p.id, p.strategy_option_id ? optionById.get(p.strategy_option_id)?.strategy_type : null])
    );
  }, [projects, strategyOptions]);

  const platformChartData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of records) {
      const output = outputById.get(r.content_output_id);
      if (!output || r.performance_score === null) continue;
      const entry = map.get(output.platform) ?? { sum: 0, count: 0 };
      entry.sum += r.performance_score;
      entry.count += 1;
      map.set(output.platform, entry);
    }
    return Array.from(map.entries()).map(([platform, { sum, count }]) => ({
      platform,
      score: Math.round((sum / count) * 10) / 10,
    }));
  }, [records, outputById]);

  const strategyTypeChartData = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const r of records) {
      const output = outputById.get(r.content_output_id);
      if (!output || r.performance_score === null) continue;
      const strategyType = strategyTypeByProject.get(output.content_project_id);
      if (!strategyType) continue;
      const entry = map.get(strategyType) ?? { sum: 0, count: 0 };
      entry.sum += r.performance_score;
      entry.count += 1;
      map.set(strategyType, entry);
    }
    return Array.from(map.entries()).map(([type, { sum, count }]) => ({
      type,
      score: Math.round((sum / count) * 10) / 10,
    }));
  }, [records, outputById, strategyTypeByProject]);

  const latestAnalysisEvent = events.find((e) => e.event_type === "performance_registered");
  const weightEvents = events.filter((e) => e.event_type === "preference_updated").slice(0, 5);

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">성과 학습센터</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          콘텐츠 성과를 입력하면 AI가 원인을 분석하고 다음 전략에 반영합니다
        </h1>
      </div>

      <RegisterForm outputs={outputs} preselectedOutputId={preselectedOutputId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="플랫폼별 평균 성과 점수" data={platformChartData} xKey="platform" />
        <ChartCard title="전략 유형별 평균 성과 점수" data={strategyTypeChartData} xKey="type" />
      </div>

      <div id="ai-analysis" className="scroll-mt-6">
        {latestAnalysisEvent ? (
          <AnalysisCard event={latestAnalysisEvent} />
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-400 text-sm">
            아직 AI 성과 해석 결과가 없습니다. 성과를 입력하면 AI가 원인을 분석합니다.
          </div>
        )}
      </div>

      {weightEvents.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="font-medium text-neutral-900 mb-3">학습 전후 가중치 (선호 학습)</p>
          <div className="space-y-2">
            {weightEvents.map((e) => {
              const before = e.before_state as Record<string, number> | null;
              const after = e.after_state as Record<string, number> | null;
              const key = before ? Object.keys(before)[0] : after ? Object.keys(after)[0] : "";
              const beforeVal = before?.[key];
              const afterVal = after?.[key];
              const up = (afterVal ?? 0) >= (beforeVal ?? 0);
              return (
                <div key={e.id} className="flex items-center justify-between text-sm border-b border-neutral-100 pb-2">
                  <span className="text-neutral-600">{e.description}</span>
                  <span className="flex items-center gap-1 font-medium">
                    {beforeVal?.toFixed(2)} → {afterVal?.toFixed(2)}
                    {up ? (
                      <TrendingUp className="size-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="size-3.5 text-orange-500" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {weights && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["clarity_weight", "명확성"],
                  ["authority_weight", "전문성"],
                  ["purchase_link_weight", "구매연결"],
                  ["brand_fit_weight", "브랜드적합"],
                  ["novelty_weight", "새로움"],
                  ["empathy_weight", "공감도"],
                ] as [keyof typeof weights, string][]
              ).map(([key, label]) => (
                <Badge key={key} variant="outline" className="text-[10px]">
                  {label} {Number(weights[key]).toFixed(2)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <RecordsTable records={records} outputById={outputById} />
    </div>
  );
}

function RegisterForm({
  outputs,
  preselectedOutputId,
}: {
  outputs: ContentOutput[];
  preselectedOutputId: string | null;
}) {
  const [state, action, pending] = useActionState(registerPerformanceAction, initialState);
  const [selectedId, setSelectedId] = useState(preselectedOutputId ?? outputs[0]?.id ?? "");

  if (outputs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
        등록된 콘텐츠가 없습니다. 콘텐츠 오케스트레이터에서 먼저 콘텐츠를 생성하세요.
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
      <p className="font-medium text-neutral-900">성과 입력</p>
      <input type="hidden" name="contentOutputId" value={selectedId} />
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>콘텐츠</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="콘텐츠 선택" />
            </SelectTrigger>
            <SelectContent>
              {outputs.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  [{o.platform}] {o.title ?? "제목 없음"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="measuredAt">측정일</Label>
          <Input id="measuredAt" name="measuredAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {METRIC_FIELDS.map((f) => (
          <div key={f.name} className="space-y-1">
            <Label htmlFor={f.name} className="text-xs">
              {f.label}
            </Label>
            <Input id={f.name} name={f.name} type="number" min={0} defaultValue={0} />
          </div>
        ))}
      </div>

      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
      <Button type="submit" disabled={pending || !selectedId}>
        {pending ? "저장 및 분석 중..." : "성과 등록"}
      </Button>
    </form>
  );
}

function ChartCard({ title, data, xKey }: { title: string; data: { score: number }[]; xKey: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="font-medium text-neutral-900 mb-3">{title}</p>
      {data.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-neutral-400 text-sm">데이터 없음</div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="score" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function AnalysisCard({ event }: { event: LearningEvent }) {
  const analysis = (event.after_state as { analysis?: Record<string, unknown> } | null)?.analysis as
    | {
        whatWorked: string[];
        whatUnderperformed: string[];
        viewsVsPurchaseGap: string;
        keepElements: string[];
        reviseElements: string[];
        nextContentSuggestions: string[];
      }
    | undefined;

  if (!analysis) return null;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
      <div className="flex items-center gap-1.5 text-violet-700">
        <Sparkles className="size-4" />
        <p className="font-medium">최근 AI 성과 해석</p>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <AnalysisList label="성과가 좋았던 이유" items={analysis.whatWorked} />
        <AnalysisList label="성과가 낮았던 이유" items={analysis.whatUnderperformed} />
        <AnalysisList label="유지할 전략 요소" items={analysis.keepElements} />
        <AnalysisList label="수정할 전략 요소" items={analysis.reviseElements} />
      </div>
      <div className="mt-3">
        <p className="font-medium text-neutral-800 text-sm">조회 성과 vs 구매 성과</p>
        <p className="text-sm text-neutral-600">{analysis.viewsVsPurchaseGap}</p>
      </div>
      <div className="mt-3">
        <p className="font-medium text-neutral-800 text-sm">다음 콘텐츠 제안</p>
        <ul className="text-sm text-neutral-600 list-disc list-inside">
          {analysis.nextContentSuggestions.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AnalysisList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-neutral-800">{label}</p>
      <ul className="text-neutral-600 list-disc list-inside">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function RecordsTable({
  records,
  outputById,
}: {
  records: PerformanceRecord[];
  outputById: Map<string, ContentOutput>;
}) {
  if (records.length === 0) return null;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-neutral-500">
            <th className="p-3">콘텐츠</th>
            <th className="p-3">플랫폼</th>
            <th className="p-3">측정일</th>
            <th className="p-3">조회</th>
            <th className="p-3">구매</th>
            <th className="p-3">성과 점수</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const output = outputById.get(r.content_output_id);
            return (
              <tr key={r.id} className="border-b border-neutral-50">
                <td className="p-3 max-w-xs truncate">{output?.title ?? "삭제된 콘텐츠"}</td>
                <td className="p-3">{output?.platform}</td>
                <td className="p-3">{new Date(r.measured_at).toLocaleDateString("ko-KR")}</td>
                <td className="p-3">{r.views.toLocaleString()}</td>
                <td className="p-3">{r.purchases.toLocaleString()}</td>
                <td className="p-3 font-medium text-violet-700">{r.performance_score ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
