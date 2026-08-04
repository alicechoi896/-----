"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
import { DemoBadge } from "@/components/demo/demo-badge";
import { useDemoBrainStore } from "@/lib/demo/store";
import {
  DEFAULT_REFERENCE_URL,
  ANALYSIS_PURPOSES,
  ANALYSIS_STEPS,
  REFERENCE_EXCERPT,
  EXTRACTED_STRUCTURE_SUMMARY,
  EXTRACTED_ELEMENT_CARDS,
  ANALYSIS_EVIDENCE,
  BRAIN_REFLECTION_RESULT,
  detectPlatform,
  type AnalysisPurpose,
} from "@/lib/demo/reference-analysis-data";
import {
  Link2,
  Play,
  Circle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  XCircle,
  Save,
  Sparkles,
} from "lucide-react";

type StepStatus = "대기" | "분석 중" | "완료";

const STEP_DELAY_MS = 550;

export function ReferenceAnalysisClient() {
  const [url, setUrl] = useState(DEFAULT_REFERENCE_URL);
  const [purpose, setPurpose] = useState<AnalysisPurpose>("구조 분석");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [excluded, setExcluded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(
    Object.fromEntries(ANALYSIS_STEPS.map((s) => [s.id, "대기" as StepStatus]))
  );
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const platform = useMemo(() => detectPlatform(url), [url]);
  const { referenceAnalysisApplied, applyReferenceAnalysis } = useDemoBrainStore();

  function startAnalysis() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setDone(false);
    setExcluded(false);
    setSaved(false);
    setRunning(true);
    setStepStatuses(Object.fromEntries(ANALYSIS_STEPS.map((s) => [s.id, "대기" as StepStatus])));

    ANALYSIS_STEPS.forEach((step, index) => {
      const startAt = index * STEP_DELAY_MS;
      const t1 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "분석 중" }));
      }, startAt);
      const t2 = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: "완료" }));
        if (index === ANALYSIS_STEPS.length - 1) {
          setRunning(false);
          setDone(true);
        }
      }, startAt + STEP_DELAY_MS - 100);
      timeoutsRef.current.push(t1, t2);
    });
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">AI 학습센터</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">참조 콘텐츠 분석</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-500 leading-relaxed">
            블로그, 유튜브, 인스타그램, 스레드 등의 참조 URL에서 콘텐츠의 표현 문구를 복사하는 것이 아니라, 훅,
            전개 구조, CTA 위치, 문장 스타일과 설득 패턴을 구조화하여 추출합니다.
          </p>
        </div>
        <DemoBadge variant="prototype" />
      </div>

      {/* 입력 영역 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ref-url">참조 URL</Label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
              <Input
                id="ref-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9"
                placeholder="https://..."
              />
            </div>
          </div>
          <div className="space-y-1.5 w-full md:w-56">
            <Label>플랫폼 유형 (자동 판별)</Label>
            <div className="h-9 rounded-md border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm text-neutral-700">
              {platform}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
          <div className="space-y-1.5">
            <Label>분석 목적</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as AnalysisPurpose)}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYSIS_PURPOSES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={startAnalysis} disabled={running || !url} className="w-full md:w-auto">
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 분석 중...
              </>
            ) : (
              <>
                <Play className="size-4" /> 분석 시작
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 파이프라인 단계 */}
      {(running || done) && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="font-medium text-neutral-900 mb-4">분석 파이프라인</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ANALYSIS_STEPS.map((step, i) => {
              const status = stepStatuses[step.id];
              return (
                <div
                  key={step.id}
                  className={`rounded-xl border p-3 flex items-center gap-2.5 transition-colors ${
                    status === "완료"
                      ? "border-emerald-200 bg-emerald-50/60"
                      : status === "분석 중"
                        ? "border-sky-200 bg-sky-50/60"
                        : "border-neutral-200 bg-neutral-50"
                  }`}
                >
                  {status === "완료" ? (
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  ) : status === "분석 중" ? (
                    <Loader2 className="size-4 text-sky-600 shrink-0 animate-spin" />
                  ) : (
                    <Circle className="size-4 text-neutral-300 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-neutral-400">{i + 1}단계</p>
                    <p className="text-sm font-medium text-neutral-800 truncate">{step.label}</p>
                    <p
                      className={`text-xs ${
                        status === "완료" ? "text-emerald-600" : status === "분석 중" ? "text-sky-600" : "text-neutral-400"
                      }`}
                    >
                      {status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 분석 결과 */}
      {done && (
        <>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-neutral-900">참조 콘텐츠 구조 분석</p>
              <DemoBadge variant="demo-result" />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">훅 유형</p>
                <p className="font-medium text-neutral-900">{EXTRACTED_STRUCTURE_SUMMARY.hookType}</p>
              </div>
              <div>
                <p className="text-neutral-500">CTA 위치</p>
                <p className="font-medium text-neutral-900">{EXTRACTED_STRUCTURE_SUMMARY.ctaPosition}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-neutral-500 mb-1.5">콘텐츠 전개</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {EXTRACTED_STRUCTURE_SUMMARY.contentFlow.map((f, i) => (
                    <span key={f} className="flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-white">
                        {f}
                      </Badge>
                      {i < EXTRACTED_STRUCTURE_SUMMARY.contentFlow.length - 1 && (
                        <ArrowRight className="size-3.5 text-neutral-300" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-neutral-500">평균 문장 길이</p>
                <p className="font-medium text-neutral-900">{EXTRACTED_STRUCTURE_SUMMARY.avgSentenceLength}자</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-700 mb-1.5">핵심 표현 방식</p>
                <ul className="text-sm text-neutral-600 space-y-0.5 list-disc list-inside">
                  {EXTRACTED_STRUCTURE_SUMMARY.keyExpressionStyles.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-orange-600 mb-1.5">그대로 사용하지 않을 요소</p>
                <ul className="text-sm text-neutral-600 space-y-0.5 list-disc list-inside">
                  {EXTRACTED_STRUCTURE_SUMMARY.excludedElements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* 추출 요소 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {EXTRACTED_ELEMENT_CARDS.map((c) => (
              <div key={c.label} className="rounded-xl border border-neutral-200 bg-white p-3">
                <p className="text-xs text-neutral-400">{c.label}</p>
                <p className="mt-1 text-sm font-medium text-neutral-900">{c.value}</p>
              </div>
            ))}
          </div>

          {/* 원문 vs 추출 결과 비교 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <p className="font-medium text-neutral-900 mb-2">참조 콘텐츠 원문 일부</p>
              <p className="text-sm text-neutral-600 whitespace-pre-line leading-relaxed">{REFERENCE_EXCERPT}</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-white p-5">
              <p className="font-medium text-neutral-900 mb-2 flex items-center gap-1.5">
                <Sparkles className="size-4 text-violet-600" /> AI가 추출한 구조
              </p>
              <ol className="text-sm text-neutral-700 space-y-1.5 list-decimal list-inside">
                <li>
                  <strong>훅:</strong> {EXTRACTED_STRUCTURE_SUMMARY.hookType}
                </li>
                <li>
                  <strong>전개:</strong> {EXTRACTED_STRUCTURE_SUMMARY.contentFlow.join(" → ")}
                </li>
                <li>
                  <strong>CTA:</strong> {EXTRACTED_STRUCTURE_SUMMARY.ctaPosition}
                </li>
                <li>
                  <strong>문장 스타일:</strong> 평균 {EXTRACTED_STRUCTURE_SUMMARY.avgSentenceLength}자, 짧고 직접적
                </li>
              </ol>
            </div>
          </div>

          {/* 분석 근거 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="font-medium text-neutral-900 mb-3">분석 근거</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {ANALYSIS_EVIDENCE.map((e) => (
                <div key={e.label} className="rounded-xl bg-neutral-50 p-3 text-center">
                  <p className="text-xl font-semibold text-violet-700">{e.value}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">{e.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 하단 버튼 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            {!referenceAnalysisApplied ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setExcluded(true)}
                  disabled={excluded}
                >
                  <XCircle className="size-4" /> {excluded ? "학습 제외됨" : "학습 제외"}
                </Button>
                <Button variant="secondary" onClick={() => setSaved(true)} disabled={saved}>
                  <Save className="size-4" /> {saved ? "저장됨" : "분석 결과 저장"}
                </Button>
                <Button onClick={applyReferenceAnalysis} disabled={excluded}>
                  <Sparkles className="size-4" /> 마케팅 브레인에 반영
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="size-4" /> 학습 완료
                  </p>
                  <DemoBadge variant="demo-result" />
                </div>
                <ul className="mt-2 text-sm text-neutral-700 space-y-0.5 list-disc list-inside">
                  {BRAIN_REFLECTION_RESULT.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-medium text-violet-700">
                  AI 브레인 버전 v1.2에서 v1.3으로 변경
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
