"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DemoBadge } from "@/components/demo/demo-badge";
import { useDemoBrainStore } from "@/lib/demo/store";
import { GENERATION_GUIDE_CHANGES, BEFORE_AFTER_CONTENT, type RuleUpdateRow } from "@/lib/demo/rule-update-data";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  ListChecks,
  GitBranch,
  Clock,
} from "lucide-react";

const CYCLE_STEPS = [
  "성과 데이터 수집",
  "성과 원인 해석",
  "콘텐츠 요소별 평가",
  "우선순위 및 가중치 조정",
  "생성 가이드 갱신",
  "다음 콘텐츠 생성에 반영",
];

const TOP_METRICS = [
  { label: "분석 콘텐츠", value: "58건" },
  { label: "분석 기간", value: "최근 90일" },
  { label: "분석 플랫폼", value: "4개" },
  { label: "변경된 생성 규칙", value: "6개" },
];

export function RuleUpdateMainPanel({ approverEmail }: { approverEmail: string }) {
  const store = useDemoBrainStore();
  const [detailRow, setDetailRow] = useState<(RuleUpdateRow & { status: string }) | null>(null);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const includedCount = store.ruleRows.length - excludedIds.size;

  function handleApply() {
    store.applyRuleUpdate();
    setConfirmOpen(false);
    toast.success(`AI 브레인이 ${store.pendingVersion}로 업데이트되었습니다.`, {
      description: `생성 규칙 ${includedCount}개가 반영되었습니다.`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500">
          콘텐츠 성과가 어떻게 생성 규칙과 AI 브레인 버전에 반영되는지 확인합니다.
        </p>
        <DemoBadge variant="prototype" />
      </div>

      {/* 순환 구조 */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-max">
          {CYCLE_STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-2">
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3.5 py-2.5 text-center w-40 shrink-0">
                <p className="text-xs font-medium text-violet-700">{step}</p>
              </div>
              {i < CYCLE_STEPS.length - 1 && <ArrowRight className="size-4 text-neutral-300 shrink-0" />}
            </span>
          ))}
        </div>
      </div>

      {/* 상단 지표 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {TOP_METRICS.map((m) => (
          <div key={m.label} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xl font-semibold text-neutral-900">{m.value}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{m.label}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
          <p className="text-xl font-semibold text-violet-700">{store.currentVersion}</p>
          <p className="text-xs text-neutral-500 mt-0.5">현재 AI 브레인 버전</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <Badge
            className={
              store.learningStatus === "반영 완료"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-sky-100 text-sky-700"
            }
            variant="secondary"
          >
            {store.learningStatus}
          </Badge>
          <p className="text-xs text-neutral-500 mt-1.5">학습 상태</p>
        </div>
      </div>

      {/* 가중치 변경 표 */}
      <div ref={tableRef} className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto scroll-mt-6">
        <div className="p-5 pb-0 flex items-center gap-1.5">
          <ListChecks className="size-4 text-violet-600" />
          <p className="font-medium text-neutral-900">콘텐츠 요소별 가중치 변경</p>
        </div>
        <Table className="mt-3">
          <TableHeader>
            <TableRow>
              <TableHead>콘텐츠 요소</TableHead>
              <TableHead>가중치 변화</TableHead>
              <TableHead>성과 분석 결과</TableHead>
              <TableHead>적용 성과지표</TableHead>
              <TableHead>변경 이유</TableHead>
              <TableHead>반영 상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {store.ruleRows.map((row) => {
              const up = row.newWeight >= row.oldWeight;
              const excluded = excludedIds.has(row.id);
              return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${excluded ? "opacity-50" : ""}`}
                  onClick={() => setDetailRow(row)}
                >
                  <TableCell className="font-medium">{row.element}</TableCell>
                  <TableCell className="min-w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                          <div className="h-full bg-neutral-300" style={{ width: `${row.oldWeight * 100}%` }} />
                        </div>
                        <div className="h-1.5 mt-1 rounded-full bg-neutral-100 overflow-hidden">
                          <div
                            className={`h-full ${up ? "bg-emerald-500" : "bg-orange-500"}`}
                            style={{ width: `${row.newWeight * 100}%` }}
                          />
                        </div>
                      </div>
                      {up ? (
                        <TrendingUp className="size-4 text-emerald-600 shrink-0" />
                      ) : (
                        <TrendingDown className="size-4 text-orange-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                      {row.oldWeight.toFixed(2)} → {row.newWeight.toFixed(2)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600 max-w-48">{row.performanceResult}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.metric}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600 max-w-48">{row.reason}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        excluded
                          ? "bg-neutral-100 text-neutral-500"
                          : row.status === "반영 완료"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-sky-100 text-sky-700"
                      }
                    >
                      {excluded ? "제외됨" : row.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 하단: 생성 가이드 + 버전 업데이트 */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="font-medium text-neutral-900 mb-3">이번 학습으로 변경될 생성 가이드</p>
          <ol className="space-y-2 text-sm text-neutral-700">
            {GENERATION_GUIDE_CHANGES.map((g, i) => (
              <li key={g} className="flex gap-2">
                <span className="shrink-0 size-5 rounded-full bg-violet-100 text-violet-700 text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                {g}
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <GitBranch className="size-4 text-violet-600" />
            <p className="font-medium text-neutral-900">AI 브레인 버전 업데이트</p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">현재 버전</span>
              <span className="font-medium text-neutral-900">{store.currentVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">변경 예정 버전</span>
              <span className="font-medium text-violet-700">{store.pendingVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">변경 규칙</span>
              <span className="font-medium text-neutral-900">{includedCount}개</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">변경 이유</span>
              <span className="font-medium text-neutral-900 text-right">최근 90일 콘텐츠 성과 분석</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })}
            >
              변경사항 검토
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExcludeOpen(true)} disabled={store.ruleUpdateApplied}>
              선택 규칙 제외
            </Button>
            {store.ruleUpdateApplied ? (
              <Button size="sm" disabled className="bg-emerald-600">
                <CheckCircle2 className="size-4" /> 반영 완료
              </Button>
            ) : (
              <Button size="sm" onClick={() => setConfirmOpen(true)}>
                <Sparkles className="size-4" /> AI 브레인에 적용
              </Button>
            )}
          </div>
          {store.ruleUpdateApplied && store.ruleAppliedAt && (
            <p className="mt-2 text-xs text-neutral-500 flex items-center gap-1">
              <Clock className="size-3" /> {new Date(store.ruleAppliedAt).toLocaleString("ko-KR")} 반영 (승인자:{" "}
              {approverEmail})
            </p>
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      <Sheet open={!!detailRow} onOpenChange={(open) => !open && setDetailRow(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detailRow?.element}</SheetTitle>
            <SheetDescription>가중치 변경 상세 내역</SheetDescription>
          </SheetHeader>
          {detailRow && (
            <div className="px-4 pb-4 space-y-3 text-sm overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-neutral-50 p-2.5">
                  <p className="text-xs text-neutral-400">변경 전 가중치</p>
                  <p className="font-semibold text-neutral-900">{detailRow.oldWeight.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-violet-50 p-2.5">
                  <p className="text-xs text-neutral-400">변경 후 가중치</p>
                  <p className="font-semibold text-violet-700">{detailRow.newWeight.toFixed(2)}</p>
                </div>
              </div>
              <p>
                <span className="font-medium">분석 대상 콘텐츠 수:</span> {detailRow.analyzedContentCount}건
              </p>
              <p>
                <span className="font-medium">성과지표 비교:</span> {detailRow.metricComparison}
              </p>
              <div>
                <p className="font-medium mb-1">변경을 유발한 콘텐츠</p>
                <ul className="list-disc list-inside text-neutral-600 space-y-0.5">
                  {detailRow.triggerContents.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium mb-1">적용 대상 플랫폼</p>
                <div className="flex flex-wrap gap-1">
                  {detailRow.platforms.map((p) => (
                    <Badge key={p} variant="outline">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              <p>
                <span className="font-medium">AI가 해석한 변경 이유:</span> {detailRow.aiInterpretation}
              </p>
              <p className="rounded-lg bg-violet-50 p-2.5 text-violet-700">
                <span className="font-medium">다음 생성에 미치는 영향:</span> {detailRow.nextImpact}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 선택 규칙 제외 */}
      <Dialog open={excludeOpen} onOpenChange={setExcludeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반영에서 제외할 규칙 선택</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {store.ruleRows.map((row) => (
              <label key={row.id} className="flex items-center gap-2 text-sm rounded-lg border border-neutral-200 p-2.5">
                <Checkbox
                  checked={excludedIds.has(row.id)}
                  onCheckedChange={(checked) =>
                    setExcludedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(row.id);
                      else next.delete(row.id);
                      return next;
                    })
                  }
                />
                <span className="flex-1">{row.element}</span>
                <span className="text-xs text-neutral-400">
                  {row.oldWeight.toFixed(2)} → {row.newWeight.toFixed(2)}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setExcludeOpen(false)}>확인 ({includedCount}개 반영 예정)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 브레인 적용 확인 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI 브레인에 적용하시겠습니까?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-neutral-600 leading-relaxed">
            선택한 생성 규칙 {includedCount}개를 AI 브레인 {store.pendingVersion}에 반영하시겠습니까?
            <br />
            반영 이후 생성되는 콘텐츠에는 변경된 우선순위와 가이드가 적용됩니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              취소
            </Button>
            <Button onClick={handleApply}>적용</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function RuleUpdateBeforeAfterPanel() {
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  function handleRegenerate() {
    setRegenerating(true);
    setRegenerated(false);
    setTimeout(() => {
      setRegenerating(false);
      setRegenerated(true);
    }, 900);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <p className="font-medium text-neutral-900">변경 전후 콘텐츠 비교</p>
          <p className="mt-1 text-sm text-neutral-500">
            같은 조건으로 생성 규칙 반영 전/후 콘텐츠가 어떻게 달라지는지 비교합니다.
          </p>
        </div>
        <DemoBadge variant="demo-result" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-neutral-200 p-4">
          <Badge variant="outline" className="mb-2">
            {BEFORE_AFTER_CONTENT.before.version} 기존 생성 결과
          </Badge>
          <p className="font-medium text-neutral-900">{BEFORE_AFTER_CONTENT.before.title}</p>
          <ul className="mt-2 text-sm text-neutral-600 list-disc list-inside space-y-0.5">
            {BEFORE_AFTER_CONTENT.before.structure.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div
          className={`rounded-xl border-2 p-4 transition-all ${
            regenerated ? "border-violet-400 bg-violet-50/50 shadow-sm" : "border-neutral-200"
          }`}
        >
          <Badge className="mb-2 bg-violet-600 text-white">
            {BEFORE_AFTER_CONTENT.after.version} 업데이트 후 생성 결과
          </Badge>
          <p className="font-medium text-neutral-900">{BEFORE_AFTER_CONTENT.after.title}</p>
          <ul className="mt-2 text-sm text-neutral-600 list-disc list-inside space-y-0.5">
            {BEFORE_AFTER_CONTENT.after.structure.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1">
            {BEFORE_AFTER_CONTENT.after.changeBadges.map((b) => (
              <Badge key={b} variant="outline" className="text-[10px] border-violet-300 text-violet-700">
                {b}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <Button className="mt-4" variant="outline" disabled={regenerating} onClick={handleRegenerate}>
        <RefreshCw className={`size-4 ${regenerating ? "animate-spin" : ""}`} />
        {regenerating ? "새 규칙으로 다시 생성 중..." : "새 규칙으로 다시 생성"}
      </Button>
    </div>
  );
}
