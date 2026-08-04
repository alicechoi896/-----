"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { CampaignGoal, CampaignStatus } from "@/types/database";
import {
  Package,
  Sparkles,
  FlaskConical,
  CheckCircle2,
  PenSquare,
  ClipboardCheck,
  TrendingUp,
  Brain,
  Circle,
  RefreshCw,
  ChevronRight,
  ScrollText,
  Radio,
  Repeat,
  TrendingDown,
} from "lucide-react";

export type StageStatus = "not_started" | "in_progress" | "completed" | "failed";

export interface WorkflowStage {
  key: string;
  label: string;
  status: StageStatus;
  timestamp: string | null;
  detail: string | null;
  actionHref: string | null;
  actionLabel: string | null;
}

export interface WorkflowRun {
  campaignId: string;
  campaignName: string;
  campaignGoal: CampaignGoal;
  campaignStatus: CampaignStatus;
  createdAt: string;
  stages: WorkflowStage[];
}

const GOAL_LABEL: Record<CampaignGoal, string> = {
  awareness: "인지도",
  views: "조회수",
  saves: "저장",
  inquiries: "문의",
  consultations: "상담",
  purchases: "구매",
};

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "초안",
  active: "진행 중",
  completed: "완료",
  archived: "보관됨",
};

const STAGE_ICONS = [Package, Sparkles, FlaskConical, CheckCircle2, PenSquare, ClipboardCheck, TrendingUp, Brain];

const STATUS_BADGE: Record<StageStatus, string> = {
  not_started: "bg-neutral-100 text-neutral-500",
  in_progress: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-orange-100 text-orange-700",
};

const STATUS_LABEL: Record<StageStatus, string> = {
  not_started: "대기",
  in_progress: "진행 중",
  completed: "완료",
  failed: "실패",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TEMPLATES = [
  {
    icon: Sparkles,
    title: "신상품 콘텐츠 제작",
    description: "새로운 상품/서비스를 등록하고 AI 분석부터 콘텐츠 생성까지 전체 파이프라인을 실행합니다.",
  },
  {
    icon: Repeat,
    title: "기존 콘텐츠 재활용",
    description: "기존에 등록된 자료와 지식을 기반으로 새로운 전략을 재생성하고 다른 채널용 콘텐츠를 제작합니다.",
  },
  {
    icon: TrendingDown,
    title: "성과 저하 콘텐츠 개선",
    description: "성과가 낮은 콘텐츠의 데이터를 분석해 개선된 전략과 콘텐츠를 다시 생성합니다.",
  },
];

export function WorkflowClient({
  userEmail,
  runs,
  orgDataNote,
}: {
  userEmail: string;
  runs: WorkflowRun[];
  orgDataNote: string;
}) {
  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">자동화 워크플로우</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          캠페인별 자동화 파이프라인 진행 상태를 확인합니다
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          상품/자료 등록 → AI 분석 → 전략 생성 → 전략 승인 → 콘텐츠 생성 → 콘텐츠 검수 → 성과 입력 → AI 학습 반영
        </p>
      </div>

      <TemplateSection />

      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">워크플로우 실행 현황</h2>
        <p className="text-sm text-neutral-500 mb-4">{orgDataNote}</p>

        {runs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-500">
            <p>아직 진행 중인 워크플로우가 없습니다.</p>
            <p className="mt-1 text-sm">
              워크플로우는 자료를 등록하고 전략을 생성하는 순간부터 시작됩니다. 먼저{" "}
              <Link href="/learning" className="text-violet-600 underline underline-offset-2">
                AI 학습센터
              </Link>
              에서 자료를 등록하거나,{" "}
              <Link href="/strategy" className="text-violet-600 underline underline-offset-2">
                전략 시뮬레이터
              </Link>
              에서 캠페인을 만들어보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => (
              <WorkflowRunCard key={run.campaignId} run={run} userEmail={userEmail} />
            ))}
          </div>
        )}
      </div>

      <ExternalPublishCard />
    </div>
  );
}

function TemplateSection() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900 mb-3">워크플로우 템플릿</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="rounded-2xl border border-neutral-200 bg-white p-5 flex flex-col">
              <div className="size-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
                <Icon className="size-4.5" />
              </div>
              <p className="mt-3 font-medium text-neutral-900">{t.title}</p>
              <p className="mt-1 text-sm text-neutral-500 flex-1">{t.description}</p>
              <Button asChild size="sm" className="mt-4 w-full">
                <Link href="/strategy">
                  실행 <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExternalPublishCard() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-xl bg-neutral-200 text-neutral-500 flex items-center justify-center shrink-0">
          <Radio className="size-4.5" />
        </div>
        <div>
          <p className="font-medium text-neutral-700">외부 채널 자동 발행</p>
          <p className="text-sm text-neutral-500">
            네이버 블로그, 인스타그램 등 외부 채널로 콘텐츠를 자동 발행하는 연동입니다. 아직 구현되지 않았습니다.
          </p>
        </div>
      </div>
      <Badge variant="outline" className="border-neutral-300 text-neutral-500 shrink-0">
        연동 예정
      </Badge>
    </div>
  );
}

function WorkflowRunCard({ run, userEmail }: { run: WorkflowRun; userEmail: string }) {
  const [logOpen, setLogOpen] = useState(false);

  const failedStage = run.stages.find((s) => s.status === "failed");
  const nextStage = run.stages.find((s) => s.status === "not_started" || s.status === "in_progress");
  const allDone = run.stages.every((s) => s.status === "completed");

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-neutral-900">{run.campaignName}</p>
            <Badge variant="outline">{GOAL_LABEL[run.campaignGoal]}</Badge>
            <Badge variant="secondary">{CAMPAIGN_STATUS_LABEL[run.campaignStatus]}</Badge>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            담당자 {userEmail} · 캠페인 생성 {formatDateTime(run.createdAt)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLogOpen((v) => !v)}>
          <ScrollText className="size-3.5" /> 실행 로그 {logOpen ? "숨기기" : "보기"}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {run.stages.map((stage, i) => {
          const Icon = STAGE_ICONS[i] ?? Circle;
          return (
            <div key={stage.key} className="rounded-xl border border-neutral-200 p-2.5">
              <Icon className="size-3.5 text-neutral-400" />
              <p className="mt-1.5 text-xs font-medium text-neutral-800 leading-tight">{stage.label}</p>
              <Badge className={`mt-1.5 ${STATUS_BADGE[stage.status]}`} variant="secondary">
                {STATUS_LABEL[stage.status]}
              </Badge>
              <p className="mt-1 text-[11px] text-neutral-400">{formatDateTime(stage.timestamp)}</p>
              {stage.detail && (
                <p className="mt-0.5 text-[11px] text-neutral-500 line-clamp-2">{stage.detail}</p>
              )}
              {stage.status === "failed" && stage.actionHref && (
                <Button asChild size="sm" variant="outline" className="mt-1.5 w-full h-6 text-[11px] text-orange-600 border-orange-200">
                  <Link href={stage.actionHref}>
                    <RefreshCw className="size-3" /> 재시도
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        {allDone ? (
          <Badge className="bg-emerald-100 text-emerald-700" variant="secondary">
            <CheckCircle2 className="size-3" /> 전체 단계 완료
          </Badge>
        ) : failedStage ? (
          <p className="text-sm text-orange-600">
            &apos;{failedStage.label}&apos; 단계에서 실패했습니다. 재시도가 필요합니다.
          </p>
        ) : (
          <p className="text-sm text-neutral-500">
            다음 단계: <span className="font-medium text-neutral-700">{nextStage?.label}</span>
          </p>
        )}
        {!allDone && nextStage?.actionHref && nextStage.status !== "failed" && (
          <Button asChild size="sm">
            <Link href={nextStage.actionHref}>
              {nextStage.actionLabel ?? "다음 단계"} <ChevronRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </div>

      {logOpen && (
        <>
          <Separator className="my-4" />
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">실행 로그</p>
            <ul className="space-y-1.5">
              {run.stages.map((stage) => (
                <li key={stage.key} className="flex items-start gap-2 text-sm">
                  <span className="text-neutral-400 shrink-0 w-36">{formatDateTime(stage.timestamp)}</span>
                  <Badge className={`${STATUS_BADGE[stage.status]} shrink-0`} variant="secondary">
                    {STATUS_LABEL[stage.status]}
                  </Badge>
                  <span className="text-neutral-700">{stage.label}</span>
                  {stage.detail && <span className="text-neutral-400">— {stage.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
