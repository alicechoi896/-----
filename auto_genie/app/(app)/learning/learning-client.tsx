"use client";

import { useActionState, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PipelineFlow, type PipelineSummary } from "@/components/learning/pipeline-flow";
import {
  registerUrlSourceAction,
  registerTextSourceAction,
  registerFileSourceAction,
  startAnalysisAction,
  deleteDataSourceAction,
  type ActionState,
} from "./actions";
import { CONTENT_CATEGORIES } from "./constants";
import { ReferenceAnalysisClient } from "./reference-analysis/reference-analysis-client";
import type { Database } from "@/types/database";
import type { ScreenMode } from "@/lib/access/screen-mode";
import { Link2, FileText, Upload, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

type DataSource = Database["public"]["Tables"]["data_sources"]["Row"];

const initialState: ActionState = { error: null };

const STATUS_LABEL: Record<DataSource["status"], string> = {
  pending: "대기",
  extracting: "본문 추출 중",
  chunking: "분할 중",
  embedding: "임베딩 중",
  analyzing: "지식 분석 중",
  completed: "완료",
  failed: "실패",
};

// 일반 사용자 화면에서는 파이프라인 처리 단계(추출/분할/임베딩)를 노출하지 않고
// "분석 중"으로 뭉뚱그려 보여준다. 실제 status 값과 관리자 화면 라벨은 그대로 둔다.
const USER_STATUS_LABEL: Record<DataSource["status"], string> = {
  pending: "대기",
  extracting: "분석 중",
  chunking: "분석 중",
  embedding: "분석 중",
  analyzing: "분석 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_COLOR: Record<DataSource["status"], string> = {
  pending: "bg-neutral-100 text-neutral-600",
  extracting: "bg-sky-100 text-sky-700",
  chunking: "bg-sky-100 text-sky-700",
  embedding: "bg-sky-100 text-sky-700",
  analyzing: "bg-sky-100 text-sky-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-orange-100 text-orange-700",
};

const SOURCE_TYPE_LABEL: Record<DataSource["source_type"], string> = {
  url: "URL",
  text: "텍스트",
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  markdown: "Markdown",
  performance: "성과 데이터",
};

interface QualitySignal {
  duplicateSources: { id: string; title: string }[];
  staleSources: { id: string; title: string; createdAt: string }[];
  conflictingEntities: { id: string; name: string; entityType: string }[];
  singleEvidenceEntities: { id: string; name: string }[];
  lowConfidenceRules: { id: string; name: string; confidence: number }[];
  noEvidenceEntities: { id: string; name: string }[];
}

export function LearningClient({
  sources,
  pipelineSummary,
  quality,
  screenMode,
}: {
  organizationId: string;
  sources: DataSource[];
  pipelineSummary: PipelineSummary;
  quality: QualitySignal;
  screenMode: ScreenMode;
}) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") ?? "register";
  const isTechnical = screenMode === "technical";

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
          {isTechnical ? "AI 학습센터" : "내 비즈니스"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          {isTechnical
            ? "기업 데이터를 등록하고 AI 분석 파이프라인을 실행합니다"
            : "회사·상품 자료를 등록하고 AI 분석 결과를 확인합니다"}
        </h1>
      </div>

      <Tabs key={initialTab} defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="register">{isTechnical ? "데이터 등록" : "회사·상품 자료 등록"}</TabsTrigger>
          {isTechnical && <TabsTrigger value="reference">참조 콘텐츠 분석</TabsTrigger>}
          <TabsTrigger value="list">
            {isTechnical ? "데이터 목록" : "등록 자료 관리"} ({sources.length})
          </TabsTrigger>
          {isTechnical && <TabsTrigger value="pipeline">분석 파이프라인</TabsTrigger>}
          <TabsTrigger value="quality">{isTechnical ? "데이터 품질관리" : "AI 분석 결과 확인"}</TabsTrigger>
        </TabsList>

        <TabsContent value="register" className="mt-4">
          <RegisterPanel />
        </TabsContent>

        {isTechnical && (
          <TabsContent value="reference" className="mt-4">
            <ReferenceAnalysisClient />
          </TabsContent>
        )}

        <TabsContent value="list" className="mt-4">
          <SourceList sources={sources} screenMode={screenMode} />
        </TabsContent>

        {isTechnical && (
          <TabsContent value="pipeline" className="mt-4">
            <PipelineFlow summary={pipelineSummary} />
          </TabsContent>
        )}

        <TabsContent value="quality" className="mt-4">
          <QualityPanel quality={quality} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RegisterPanel() {
  return (
    <Tabs defaultValue="url" className="rounded-2xl border border-neutral-200 bg-white p-5">
      <TabsList>
        <TabsTrigger value="url">
          <Link2 className="size-3.5" /> URL 등록
        </TabsTrigger>
        <TabsTrigger value="text">
          <FileText className="size-3.5" /> 텍스트 직접 입력
        </TabsTrigger>
        <TabsTrigger value="file">
          <Upload className="size-3.5" /> 파일 업로드
        </TabsTrigger>
      </TabsList>

      <TabsContent value="url" className="mt-4">
        <UrlForm />
      </TabsContent>
      <TabsContent value="text" className="mt-4">
        <TextForm />
      </TabsContent>
      <TabsContent value="file" className="mt-4">
        <FileForm />
      </TabsContent>
    </Tabs>
  );
}

function CategorySelect({ name }: { name: string }) {
  return (
    <Select name={name} required>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="자료 유형 선택" />
      </SelectTrigger>
      <SelectContent>
        {CONTENT_CATEGORIES.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AfterRegisterHint({ sourceId }: { sourceId?: string }) {
  const [pending, startTransition] = useTransition();
  if (!sourceId) return null;
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 flex items-center justify-between">
      <p className="text-sm text-violet-700">자료가 등록되었습니다. AI 분석을 시작하시겠습니까?</p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await startAnalysisAction(sourceId); })}
      >
        {pending ? "분석 중..." : "AI 분석 시작"}
      </Button>
    </div>
  );
}

function UrlForm() {
  const [state, action, pending] = useActionState(registerUrlSourceAction, initialState);
  return (
    <form action={action} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label htmlFor="url">URL</Label>
        <Input id="url" name="url" type="url" required placeholder="https://example.com/product" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="title">자료명</Label>
        <Input id="title" name="title" required placeholder="예: 대표 상품 상세페이지" />
      </div>
      <div className="space-y-1.5">
        <Label>자료 유형</Label>
        <CategorySelect name="category" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="purpose">분석 목적 (선택)</Label>
        <Input id="purpose" name="purpose" placeholder="예: 상품 상세 정보 구조화" />
      </div>
      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "등록 중..." : "자료 등록"}
      </Button>
      <AfterRegisterHint sourceId={state.sourceId} />
    </form>
  );
}

function TextForm() {
  const [state, action, pending] = useActionState(registerTextSourceAction, initialState);
  return (
    <form action={action} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label htmlFor="text-title">제목</Label>
        <Input id="text-title" name="title" required placeholder="예: 대표 강의 노하우 메모" />
      </div>
      <div className="space-y-1.5">
        <Label>자료 유형</Label>
        <CategorySelect name="category" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">본문</Label>
        <Textarea id="body" name="body" required minLength={10} rows={8} placeholder="내용을 붙여넣으세요" />
      </div>
      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "등록 중..." : "자료 등록"}
      </Button>
      <AfterRegisterHint sourceId={state.sourceId} />
    </form>
  );
}

function FileForm() {
  const [state, action, pending] = useActionState(registerFileSourceAction, initialState);
  return (
    <form action={action} className="space-y-4 max-w-xl">
      <div className="space-y-1.5">
        <Label htmlFor="file-title">자료명</Label>
        <Input id="file-title" name="title" required placeholder="예: 브랜드 가이드북" />
      </div>
      <div className="space-y-1.5">
        <Label>자료 유형</Label>
        <CategorySelect name="category" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="file">파일 (PDF, DOCX, TXT, Markdown / 최대 10MB)</Label>
        <Input id="file" name="file" type="file" required accept=".pdf,.docx,.txt,.md" />
      </div>
      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "업로드 중..." : "자료 등록"}
      </Button>
      <AfterRegisterHint sourceId={state.sourceId} />
    </form>
  );
}

function SourceList({ sources, screenMode }: { sources: DataSource[]; screenMode: ScreenMode }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const statusLabel = screenMode === "technical" ? STATUS_LABEL : USER_STATUS_LABEL;

  if (sources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-500">
        아직 등록된 자료가 없습니다. &apos;데이터 등록&apos; 탭에서 첫 자료를 등록하세요.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>자료명</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>진행률</TableHead>
            <TableHead>등록일</TableHead>
            <TableHead className="text-right">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <TableRow key={source.id}>
              <TableCell className="font-medium max-w-xs truncate">{source.title}</TableCell>
              <TableCell>{SOURCE_TYPE_LABEL[source.source_type]}</TableCell>
              <TableCell>
                <Badge className={STATUS_COLOR[source.status]} variant="secondary">
                  {statusLabel[source.status]}
                </Badge>
                {source.error_message && screenMode === "technical" && (
                  <p className="mt-1 text-xs text-orange-600 max-w-xs truncate">{source.error_message}</p>
                )}
              </TableCell>
              <TableCell className="w-32">
                <Progress value={source.processing_progress} />
              </TableCell>
              <TableCell className="text-neutral-500 text-sm">
                {new Date(source.created_at).toLocaleDateString("ko-KR")}
              </TableCell>
              <TableCell className="text-right space-x-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === source.id}
                  onClick={() => {
                    setPendingId(source.id);
                    startTransition(async () => {
                      await startAnalysisAction(source.id);
                      setPendingId(null);
                    });
                  }}
                >
                  <RefreshCw className="size-3.5" />
                  {source.status === "completed" ? "다시 분석" : "분석 시작"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startTransition(() => deleteDataSourceAction(source.id))}
                >
                  <Trash2 className="size-3.5 text-orange-500" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function QualityPanel({ quality }: { quality: QualitySignal }) {
  const sections = [
    { title: "중복 데이터", items: quality.duplicateSources.map((s) => s.title) },
    { title: "오래된 데이터 (90일 이상)", items: quality.staleSources.map((s) => s.title) },
    {
      title: "충돌 가능성이 있는 지식",
      items: quality.conflictingEntities.map((e) => `${e.name} (${e.entityType})`),
    },
    { title: "근거가 1개뿐인 지식", items: quality.singleEvidenceEntities.map((e) => e.name) },
    {
      title: "신뢰도가 낮은 규칙",
      items: quality.lowConfidenceRules.map((r) => `${r.name} (신뢰도 ${Math.round(r.confidence * 100)}%)`),
    },
    { title: "출처가 없는 정보", items: quality.noEvidenceEntities.map((e) => e.name) },
  ];

  const totalIssues = sections.reduce((sum, s) => sum + s.items.length, 0);

  if (totalIssues === 0) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center text-emerald-700">
        현재 발견된 데이터 품질 이슈가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sections
        .filter((s) => s.items.length > 0)
        .map((section) => (
          <div key={section.title} className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-orange-500" />
              <p className="font-medium text-neutral-900">
                {section.title} <span className="text-orange-600">({section.items.length})</span>
              </p>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-neutral-600">
              {section.items.slice(0, 8).map((item, i) => (
                <li key={i} className="truncate">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
