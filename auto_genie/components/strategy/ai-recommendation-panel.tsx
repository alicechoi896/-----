"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { DemoBadge } from "@/components/demo/demo-badge";
import {
  RECOMMENDATION,
  EVIDENCE_SOURCES,
  PERFORMANCE_COMPARISON,
  APPLIED_RULES,
  RULE_FLOW,
  EVIDENCE_DETAILS,
} from "@/lib/demo/strategy-evidence-data";
import { Sparkles, ArrowRight, FileText, Info } from "lucide-react";

const MAX_RATE = Math.max(...PERFORMANCE_COMPARISON.map((p) => p.rate));

/**
 * Pitch-deck style "AI 추천 근거" summary shown alongside the real strategy
 * comparison above. This panel is a self-contained demo narrative (fixed
 * example numbers) and does not read from the live strategy_options data —
 * clearly labeled as a demo result throughout.
 */
export function AiRecommendationPanel() {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/30 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-violet-600" />
          <p className="font-semibold text-neutral-900">AI 추천 근거</p>
        </div>
        <DemoBadge variant="demo-result" />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 왼쪽: 추천 전략 + 신뢰도 + 근거데이터 */}
        <div className="space-y-4">
          <div>
            <p className="text-xs text-neutral-500">추천 전략</p>
            <p className="text-lg font-semibold text-violet-700">{RECOMMENDATION.strategyName}</p>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-neutral-500">추천 신뢰도</span>
              <span className="font-semibold text-violet-700">{RECOMMENDATION.confidence}%</span>
            </div>
            <Progress value={RECOMMENDATION.confidence} className="h-2" />
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-800 mb-1.5">근거 데이터</p>
            <div className="grid grid-cols-2 gap-2">
              {EVIDENCE_SOURCES.map((e) => (
                <div key={e.label} className="rounded-lg bg-white border border-neutral-200 px-3 py-2">
                  <p className="text-xs text-neutral-500">{e.label}</p>
                  <p className="text-sm font-semibold text-neutral-900">{e.count}건</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 핵심 성과 비교 + 적용된 생성 규칙 */}
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-neutral-800 mb-1.5">핵심 성과 비교 (상담 전환율)</p>
            <div className="space-y-2">
              {PERFORMANCE_COMPARISON.map((p) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-neutral-600">{p.label}</span>
                    <span className="font-medium text-neutral-900">{p.rate}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${(p.rate / MAX_RATE) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-800 mb-1.5">적용된 생성 규칙</p>
            <ol className="text-xs text-neutral-600 space-y-0.5 list-decimal list-inside mb-2">
              {APPLIED_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-1.5">
              {RULE_FLOW.map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-white text-[11px]">
                    {step}
                  </Badge>
                  {i < RULE_FLOW.length - 1 && <ArrowRight className="size-3 text-neutral-300" />}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-neutral-500 flex items-center gap-1">
          <Info className="size-3.5 shrink-0" />
          추천 결과는 등록된 학습자료와 시제품 예시 성과 데이터를 기반으로 산정한 데모 결과입니다.
        </p>
        <Button variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
          <FileText className="size-3.5" /> 근거 상세보기
        </Button>
      </div>

      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>추천 근거 상세</SheetTitle>
            <SheetDescription>&quot;{RECOMMENDATION.strategyName}&quot; 추천에 사용된 근거 자료 목록입니다.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 space-y-3 overflow-y-auto">
            {EVIDENCE_DETAILS.map((d, i) => (
              <div key={d.name} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-violet-600">근거 자료 {i + 1} · {d.type}</p>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    신뢰도 {d.confidence}%
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-medium text-neutral-900">{d.name}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{d.description}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600">
                  <p>분석 건수: {d.analyzedCount}</p>
                  <p>활용도: {d.usageRate}%</p>
                  <p className="col-span-2">적용된 전략 요소: {d.appliedElements.join(", ")}</p>
                  <p className="col-span-2">마지막 반영일: {d.lastReflectedAt}</p>
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
