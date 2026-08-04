"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { regenerateStrategiesAction, selectStrategyAction } from "../actions";
import { AiRecommendationPanel } from "@/components/strategy/ai-recommendation-panel";
import type { Database } from "@/types/database";
import { RefreshCw, Eye, CheckCircle2, TrendingUp } from "lucide-react";

type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
type StrategyOption = Database["public"]["Tables"]["strategy_options"]["Row"];

interface EvidencePayload {
  citedChunks: { dataSourceTitle: string; excerpt: string; similarity: number }[];
  appliedRules: string[];
  risks: string[];
  advantages: string[];
  recommendedPlatforms: string[];
  contentMix: { platform: string; ratio: number }[];
  conflictCount: number;
}

const SELECTION_REASONS = [
  "고객 문제를 잘 짚음",
  "브랜드와 잘 맞음",
  "상품 연결성이 높음",
  "실행하기 쉬움",
  "새로움",
  "신뢰 형성에 유리함",
];

const CARD_COLORS = ["border-violet-300 bg-violet-50/40", "border-sky-300 bg-sky-50/40", "border-emerald-300 bg-emerald-50/40", "border-amber-300 bg-amber-50/40"];
const RADAR_COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b"];

export function StrategyDetailClient({
  campaign,
  runStatus,
  options,
}: {
  campaign: Campaign;
  runStatus: string | null;
  options: StrategyOption[];
}) {
  const router = useRouter();
  const [regenerating, startRegen] = useTransition();
  const [evidenceOption, setEvidenceOption] = useState<StrategyOption | null>(null);
  const [selectingOption, setSelectingOption] = useState<StrategyOption | null>(null);

  const selected = options.find((o) => o.selected) ?? null;

  const radarData = useMemo(() => {
    const dims: { key: string; label: string }[] = [
      { key: "clarity", label: "명확성" },
      { key: "authority", label: "전문성" },
      { key: "purchaseLink", label: "구매연결" },
      { key: "brandFit", label: "브랜드적합" },
      { key: "novelty", label: "새로움" },
      { key: "empathy", label: "공감도" },
    ];
    return dims.map((d) => {
      const row: Record<string, string | number> = { dimension: d.label };
      options.forEach((o, i) => {
        const scores = o.feature_scores as Record<string, number>;
        row[`전략 ${i + 1}`] = scores?.[d.key] ?? 0;
      });
      return row;
    });
  }, [options]);

  if (options.length === 0) {
    return (
      <div className="p-6 max-w-[1440px] mx-auto space-y-4">
        <BackLink />
        <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500">
          {runStatus === "failed" ? "전략 생성에 실패했습니다." : "전략을 생성하는 중입니다."}
          <div className="mt-4">
            <Button
              disabled={regenerating}
              onClick={() => startRegen(async () => {
                await regenerateStrategiesAction(campaign.id);
                router.refresh();
              })}
            >
              <RefreshCw className="size-4" /> {regenerating ? "생성 중..." : "다시 시도"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <BackLink />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">전략 비교</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{campaign.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">{campaign.current_problem}</p>
        </div>
        <Button
          variant="outline"
          disabled={regenerating}
          onClick={() => startRegen(async () => {
            await regenerateStrategiesAction(campaign.id);
            router.refresh();
          })}
        >
          <RefreshCw className="size-4" /> {regenerating ? "재생성 중..." : "전략 다시 생성"}
        </Button>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-medium text-neutral-900 mb-3">점수 비교 (feature scores)</p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              {options.map((o, i) => (
                <Radar
                  key={o.id}
                  name={`전략 ${i + 1}`}
                  dataKey={`전략 ${i + 1}`}
                  stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                  fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                  fillOpacity={0.15}
                />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {options.map((option, i) => {
          const evidence = option.evidence as unknown as EvidencePayload;
          return (
            <div
              key={option.id}
              className={`rounded-2xl border-2 p-5 ${CARD_COLORS[i % CARD_COLORS.length]} ${
                option.selected ? "ring-2 ring-violet-500" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-white">
                  {option.strategy_type}
                </Badge>
                {option.selected && (
                  <Badge className="bg-violet-600 text-white">
                    <CheckCircle2 className="size-3" /> 선택됨
                  </Badge>
                )}
              </div>
              <p className="mt-2 font-semibold text-lg text-neutral-900">{option.title}</p>
              <p className="mt-1 text-sm text-neutral-600">{option.summary}</p>

              <div className="mt-3 flex items-baseline gap-2">
                <TrendingUp className="size-4 text-violet-600" />
                <p className="text-2xl font-bold text-violet-700">{option.final_score}</p>
                <p className="text-xs text-neutral-400">
                  (기본 {option.base_score} · 선호 {option.preference_score} · 근거 {option.evidence_score})
                </p>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                <p>
                  <span className="font-medium">타깃 문제:</span> {option.target_problem}
                </p>
                <p>
                  <span className="font-medium">핵심 메시지:</span> {option.core_message}
                </p>
                <p>
                  <span className="font-medium">퍼널 단계:</span> {option.funnel_step}
                </p>
              </div>

              {evidence?.recommendedPlatforms?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {evidence.recommendedPlatforms.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] bg-white">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}

              {evidence?.advantages?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-emerald-700">예상 장점</p>
                  <ul className="text-xs text-neutral-600 list-disc list-inside">
                    {evidence.advantages.slice(0, 3).map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {evidence?.risks?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-orange-600">위험 요소</p>
                  <ul className="text-xs text-neutral-600 list-disc list-inside">
                    {evidence.risks.slice(0, 3).map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEvidenceOption(option)}>
                  <Eye className="size-3.5" /> 출처 보기
                </Button>
                {!selected && (
                  <Button size="sm" onClick={() => setSelectingOption(option)}>
                    이 전략 선택
                  </Button>
                )}
                {option.selected && (
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/orchestrator?strategyOptionId=${option.id}`)}>
                    콘텐츠 제작으로 이동
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AiRecommendationPanel />

      <EvidenceSheet option={evidenceOption} onClose={() => setEvidenceOption(null)} />
      <SelectDialog option={selectingOption} onClose={() => setSelectingOption(null)} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/strategy" className="text-sm text-neutral-500 hover:text-violet-600">
      ← 캠페인 목록으로
    </Link>
  );
}

function EvidenceSheet({ option, onClose }: { option: StrategyOption | null; onClose: () => void }) {
  const evidence = option?.evidence as unknown as EvidencePayload | undefined;
  return (
    <Sheet open={!!option} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{option?.title}</SheetTitle>
          <SheetDescription>AI가 이 전략을 만들 때 참고한 근거 자료와 의사결정 규칙입니다.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4 space-y-4 overflow-y-auto">
          <div>
            <p className="text-sm font-medium text-neutral-900 mb-1">AI 판단 근거</p>
            <p className="text-sm text-neutral-600">{option?.reasoning}</p>
          </div>
          {evidence?.appliedRules && evidence.appliedRules.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-900 mb-1">적용된 의사결정 규칙</p>
              <ul className="text-sm text-neutral-600 list-disc list-inside space-y-0.5">
                {evidence.appliedRules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-neutral-900 mb-1">참고 자료</p>
            {evidence?.citedChunks?.length ? (
              <div className="space-y-2">
                {evidence.citedChunks.map((c, i) => (
                  <div key={i} className="rounded-lg border border-neutral-200 p-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-neutral-700">{c.dataSourceTitle}</p>
                      <Badge variant="outline" className="text-[10px]">
                        유사도 {Math.round(c.similarity * 100)}%
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">{c.excerpt}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">직접 인용된 자료가 없습니다. AI의 일반적 추론입니다.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SelectDialog({ option, onClose }: { option: StrategyOption | null; onClose: () => void }) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!option) return null;

  return (
    <Dialog open={!!option} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>&quot;{option.title}&quot; 전략을 선택하시겠습니까?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-neutral-500">선택 이유를 알려주시면 다음 전략 추천에 반영됩니다 (선호 학습).</p>
          <div className="grid grid-cols-2 gap-2">
            {SELECTION_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={reasons.includes(r)}
                  onCheckedChange={(checked) =>
                    setReasons((prev) => (checked ? [...prev, r] : prev.filter((x) => x !== r)))
                  }
                />
                {r}
              </label>
            ))}
          </div>
          <Input
            placeholder="직접 입력 (선택)"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("strategyOptionId", option.id);
                reasons.forEach((r) => fd.append("reasons", r));
                if (customReason) fd.set("customReason", customReason);
                await selectStrategyAction(fd);
                onClose();
                router.push(`/orchestrator?strategyOptionId=${option.id}`);
              })
            }
          >
            {pending ? "저장 중..." : "선택 확정하고 콘텐츠 제작으로 이동"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
