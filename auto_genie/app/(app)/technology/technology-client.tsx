"use client";

import {
  Database,
  Layers,
  BrainCircuit,
  Cpu,
  PlayCircle,
  TrendingUp,
  History,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProcessingJobStatus, SourceType } from "@/types/database";

export interface LayerStats {
  dataSourceCount: number;
  sourceTypeCounts: Record<SourceType, number>;
  performanceRecordCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  entityCount: number;
  relationCount: number;
  decisionRuleCount: number;
  hasPreferenceWeights: boolean;
  strategyRunCount: number;
  strategyOptionCount: number;
  contentOutputCount: number;
  learningEventCount: number;
  lastProcessedAt: string | null;
}

export interface ProcessingJobRow {
  id: string;
  job_type: string;
  status: ProcessingJobStatus;
  current_step: string | null;
  progress: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ModelNames {
  chatModel: string;
  embeddingModel: string;
  embeddingDimension: number;
}

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  url: "URL",
  text: "텍스트",
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  markdown: "Markdown",
  performance: "성과 데이터",
};

const JOB_STATUS_LABEL: Record<ProcessingJobStatus, string> = {
  pending: "대기",
  running: "실행 중",
  completed: "완료",
  failed: "실패",
};

const JOB_STATUS_COLOR: Record<ProcessingJobStatus, string> = {
  pending: "bg-neutral-100 text-neutral-600",
  running: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-orange-100 text-orange-700",
};

type ImplStatus = "done" | "prototype" | "planned" | "future";

const IMPLEMENTATION_STATUS: { label: string; status: ImplStatus }[] = [
  { label: "URL 본문 추출", status: "done" },
  { label: "문서 임베딩", status: "done" },
  { label: "벡터 유사도 검색", status: "done" },
  { label: "기업 지식 추출", status: "done" },
  { label: "전략 추천", status: "prototype" },
  { label: "선호 가중치 학습", status: "prototype" },
  { label: "성과 피드백", status: "prototype" },
  { label: "외부 채널 자동 발행", status: "planned" },
  { label: "자체 파운데이션 모델 학습", status: "future" },
];

const IMPL_STATUS_TEXT: Record<ImplStatus, string> = {
  done: "구현 완료",
  prototype: "시제품 구현",
  planned: "연동 예정",
  future: "장기 개발 과제",
};

const IMPL_STATUS_BADGE: Record<ImplStatus, string> = {
  done: "bg-emerald-100 text-emerald-700",
  prototype: "bg-violet-100 text-violet-700",
  planned: "bg-orange-50 text-orange-600 border border-orange-200",
  future: "bg-white text-neutral-500 border border-neutral-300",
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

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function LayerCard({
  icon: Icon,
  title,
  description,
  metrics,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  metrics: { label: string; value: string | number }[];
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
          <Icon className="size-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-neutral-900">{title}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {metrics.map((m) => (
              <Badge key={m.label} variant="outline" className="font-normal">
                {m.label} <span className="ml-1 font-semibold text-neutral-800">{m.value}</span>
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TechnologyClient({
  stats,
  models,
  recentJobs,
}: {
  stats: LayerStats;
  models: ModelNames;
  recentJobs: ProcessingJobRow[];
}) {
  const sourceTypeMetrics = (Object.keys(stats.sourceTypeCounts) as SourceType[])
    .filter((t) => stats.sourceTypeCounts[t] > 0)
    .map((t) => ({ label: SOURCE_TYPE_LABEL[t], value: stats.sourceTypeCounts[t] }));

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">AI 기술 리포트</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            프로토타입의 기술 구조와 실제 처리 데이터를 확인합니다
          </h1>
        </div>
        <ProcessingJobsSheet jobs={recentJobs} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatTile label="데이터 소스 수" value={stats.dataSourceCount} />
        <StatTile label="벡터 청크 수" value={stats.chunkCount} />
        <StatTile label="지식 개체 수" value={stats.entityCount} />
        <StatTile label="관계 수" value={stats.relationCount} />
        <StatTile label="의사결정 규칙 수" value={stats.decisionRuleCount} />
        <StatTile label="누적 전략 생성 수" value={stats.strategyOptionCount} />
        <StatTile label="누적 학습 이벤트 수" value={stats.learningEventCount} />
        <StatTile label="마지막 처리 시각" value={formatDateTime(stats.lastProcessedAt)} />
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <p>
          <span className="text-neutral-500">채팅 모델</span>{" "}
          <span className="font-medium text-neutral-900">{models.chatModel}</span>
        </p>
        <p>
          <span className="text-neutral-500">임베딩 모델</span>{" "}
          <span className="font-medium text-neutral-900">{models.embeddingModel}</span>
        </p>
        <p>
          <span className="text-neutral-500">임베딩 차원</span>{" "}
          <span className="font-medium text-neutral-900">{models.embeddingDimension}</span>
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">기술 계층 구조</h2>
        <div className="space-y-3">
          <LayerCard
            icon={Database}
            title="1. 데이터 수집 계층"
            description="URL, 문서, 콘텐츠, 고객, 성과 데이터를 수집합니다."
            metrics={[
              { label: "데이터 소스 총", value: stats.dataSourceCount },
              ...sourceTypeMetrics,
              { label: "성과 기록", value: stats.performanceRecordCount },
            ]}
          />
          <LayerCard
            icon={Layers}
            title="2. 데이터 처리 계층"
            description="추출, 정제, 분할, 중복 제거, 구조화를 수행합니다."
            metrics={[{ label: "생성된 청크", value: stats.chunkCount }]}
          />
          <LayerCard
            icon={BrainCircuit}
            title="3. 지식화 계층"
            description="임베딩, 벡터 검색, 지식 개체, 지식 관계를 구조화합니다."
            metrics={[
              { label: "임베딩 완료 청크", value: stats.embeddedChunkCount },
              { label: "지식 개체", value: stats.entityCount },
              { label: "지식 관계", value: stats.relationCount },
            ]}
          />
          <LayerCard
            icon={Cpu}
            title="4. AI 추론 계층"
            description="LLM, RAG, 의사결정 규칙, 선호 가중치를 기반으로 추론합니다."
            metrics={[
              { label: "의사결정 규칙", value: stats.decisionRuleCount },
              { label: "선호 가중치", value: stats.hasPreferenceWeights ? "설정됨" : "미설정" },
            ]}
          />
          <LayerCard
            icon={PlayCircle}
            title="5. 실행 계층"
            description="전략 생성, 콘텐츠 생성, 검수, 저장을 실행합니다."
            metrics={[
              { label: "전략 실행", value: stats.strategyRunCount },
              { label: "전략안", value: stats.strategyOptionCount },
              { label: "생성 콘텐츠", value: stats.contentOutputCount },
            ]}
          />
          <LayerCard
            icon={TrendingUp}
            title="6. 피드백 계층"
            description="성과 분석, 선택 학습, 가중치 업데이트를 수행합니다."
            metrics={[
              { label: "성과 기록", value: stats.performanceRecordCount },
              { label: "학습 이벤트", value: stats.learningEventCount },
            ]}
          />
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">구현 상태</h2>
        <p className="text-sm text-neutral-500 mb-3">
          이 프로토타입은 OpenAI API를 호출하며 자체 파운데이션 모델을 학습하지 않습니다. 선호 가중치 학습은
          딥러닝이 아닌 단순 선형 가중치 조정 방식입니다.
        </p>
        <div className="rounded-2xl border border-neutral-200 bg-white divide-y divide-neutral-100">
          {IMPLEMENTATION_STATUS.map((item) => (
            <div key={item.label} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-neutral-800">{item.label}</p>
              <Badge className={IMPL_STATUS_BADGE[item.status]} variant="secondary">
                {IMPL_STATUS_TEXT[item.status]}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProcessingJobsSheet({ jobs }: { jobs: ProcessingJobRow[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="size-3.5" /> 기술 처리 과정 보기
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>실제 처리 Job 로그</SheetTitle>
          <SheetDescription>최근 처리된 작업 {jobs.length}건 (최신순)</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-4">
          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">아직 처리된 작업이 없습니다.</p>
          ) : (
            <ul className="space-y-3 pb-4">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-neutral-900">{job.job_type}</p>
                    <Badge className={JOB_STATUS_COLOR[job.status]} variant="secondary">
                      {JOB_STATUS_LABEL[job.status]}
                    </Badge>
                  </div>
                  {job.current_step && (
                    <p className="mt-1 text-xs text-neutral-500">현재 단계: {job.current_step}</p>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">진행률 {job.progress}%</p>
                  {job.error_message && (
                    <p className="mt-1 text-xs text-orange-600">{job.error_message}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-neutral-400">
                    시작 {formatDateTime(job.started_at)} · 종료 {formatDateTime(job.completed_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
