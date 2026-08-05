"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateContentAction,
  updateContentOutputAction,
  deleteContentOutputAction,
  registerManualContentAction,
  linkStrategyToProjectAction,
  analyzeContentFitAction,
  type ManualContentState,
} from "./actions";
import type { Database } from "@/types/database";
import type { ScreenMode } from "@/lib/access/screen-mode";
import type { ContentFitAnalysis } from "@/lib/ai/schemas";
import { Sparkles, Pencil, Copy, RefreshCw, TrendingUp, Trash2, History, Link2, ClipboardPlus, Gauge } from "lucide-react";

type ContentProject = Database["public"]["Tables"]["content_projects"]["Row"];
type ContentOutput = Database["public"]["Tables"]["content_outputs"]["Row"];
type StrategyOptionRef = { id: string; title: string; strategy_type: string };

const PLATFORMS: { value: string; label: string }[] = [
  { value: "naver_blog", label: "네이버 블로그" },
  { value: "instagram", label: "인스타그램 캐러셀" },
  { value: "threads", label: "스레드" },
  { value: "youtube_shorts", label: "유튜브 쇼츠" },
  { value: "newsletter", label: "이메일 뉴스레터" },
  { value: "landing_page", label: "랜딩페이지" },
];

const initialManualState: ManualContentState = { error: null };

export function OrchestratorClient({
  project,
  outputs,
  strategyOptions,
  screenMode,
}: {
  project: ContentProject;
  outputs: ContentOutput[];
  strategyOptions: StrategyOptionRef[];
  screenMode: ScreenMode;
}) {
  const router = useRouter();
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    outputs.length > 0 ? [] : PLATFORMS.map((p) => p.value)
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  const linkedStrategy = strategyOptions.find((s) => s.id === project.strategy_option_id) ?? null;

  return (
    <div className="p-6 max-w-[1440px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
          {screenMode === "technical" ? "콘텐츠 오케스트레이터" : "콘텐츠 만들기"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{project.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{project.core_message}</p>
      </div>

      <StrategyLinkCard project={project} strategyOptions={strategyOptions} linkedStrategy={linkedStrategy} />

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="font-medium text-neutral-900 mb-3">플랫폼 선택 후 AI로 동시 생성</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <label key={p.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedPlatforms.includes(p.value)}
                onCheckedChange={(checked) =>
                  setSelectedPlatforms((prev) =>
                    checked ? [...prev, p.value] : prev.filter((x) => x !== p.value)
                  )
                }
              />
              {p.label}
            </label>
          ))}
        </div>
        {error && <p className="mt-2 text-sm text-orange-600">{error}</p>}
        <Button
          className="mt-3"
          disabled={pending || selectedPlatforms.length === 0}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await generateContentAction(project.id, selectedPlatforms);
              if (result.error) setError(result.error);
              router.refresh();
            })
          }
        >
          <Sparkles className="size-4" /> {pending ? "생성 중..." : "콘텐츠 생성"}
        </Button>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <p className="font-medium text-neutral-900">직접 쓴 콘텐츠 등록</p>
          <Button variant="outline" size="sm" onClick={() => setShowManualForm((v) => !v)}>
            <ClipboardPlus className="size-3.5" /> {showManualForm ? "닫기" : "콘텐츠 등록"}
          </Button>
        </div>
        {showManualForm && <ManualContentForm projectId={project.id} onDone={() => setShowManualForm(false)} />}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {outputs.map((output) => (
          <OutputCard key={output.id} output={output} hasLinkedStrategy={Boolean(linkedStrategy)} />
        ))}
      </div>
    </div>
  );
}

function StrategyLinkCard({
  project,
  strategyOptions,
  linkedStrategy,
}: {
  project: ContentProject;
  strategyOptions: StrategyOptionRef[];
  linkedStrategy: StrategyOptionRef | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (linkedStrategy) {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 flex items-center gap-2 text-sm">
        <Link2 className="size-4 text-violet-600 shrink-0" />
        <span className="text-neutral-700">
          연결된 전략: <span className="font-medium text-violet-700">{linkedStrategy.title}</span> (
          {linkedStrategy.strategy_type})
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
      <p className="text-sm text-neutral-600">
        아직 연결된 전략이 없습니다. 전략을 연결하면 등록한 콘텐츠의 전략 적합도 분석을 받을 수 있습니다.
      </p>
      {strategyOptions.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400">연결할 수 있는 전략이 아직 없습니다.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="연결할 전략 선택" />
            </SelectTrigger>
            <SelectContent>
              {strategyOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} ({s.strategy_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedId || pending}
            onClick={() =>
              startTransition(async () => {
                const fd = new FormData();
                fd.set("contentProjectId", project.id);
                fd.set("strategyOptionId", selectedId);
                const result = await linkStrategyToProjectAction(fd);
                if (result.error) setError(result.error);
                router.refresh();
              })
            }
          >
            {pending ? "연결 중..." : "전략 연결"}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-orange-600">{error}</p>}
    </div>
  );
}

function ManualContentForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(registerManualContentAction, initialManualState);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="contentProjectId" value={projectId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>플랫폼</Label>
          <Select name="platform" defaultValue="naver_blog">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORMS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-title">제목</Label>
          <Input id="manual-title" name="title" required placeholder="콘텐츠 제목" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-hook">훅 (선택)</Label>
        <Input id="manual-hook" name="hook" placeholder="첫 문장, 시선을 끄는 문구" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="manual-body">본문</Label>
        <Textarea id="manual-body" name="body" required rows={8} placeholder="직접 작성한 콘텐츠 본문을 붙여넣으세요" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="manual-cta">CTA (선택)</Label>
          <Input id="manual-cta" name="callToAction" placeholder="행동 유도 문구" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manual-hashtags">해시태그 (쉼표로 구분, 선택)</Label>
          <Input id="manual-hashtags" name="hashtags" placeholder="예: 소상공인, 마케팅" />
        </div>
      </div>
      {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "등록 중..." : "콘텐츠 등록"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          취소
        </Button>
      </div>
    </form>
  );
}

function FitAnalysisPanel({ analysis }: { analysis: ContentFitAnalysis }) {
  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium text-violet-700 flex items-center gap-1.5">
          <Gauge className="size-3.5" /> 전략 적합도
        </p>
        <span className="text-lg font-semibold text-violet-700">{analysis.fitScore}점</span>
      </div>
      <p className="mt-1 text-neutral-600">{analysis.summary}</p>
      {analysis.matchedElements.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-700">맞는 부분</p>
          <ul className="text-xs text-neutral-600 list-disc list-inside">
            {analysis.matchedElements.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.mismatchedElements.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-700">어긋나는 부분</p>
          <ul className="text-xs text-neutral-600 list-disc list-inside">
            {analysis.mismatchedElements.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {analysis.suggestions.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-700">개선 제안</p>
          <ul className="text-xs text-neutral-600 list-disc list-inside">
            {analysis.suggestions.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OutputCard({ output, hasLinkedStrategy }: { output: ContentOutput; hasLinkedStrategy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(output.body ?? "");
  const [title, setTitle] = useState(output.title ?? "");
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalyzing] = useTransition();
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const router = useRouter();

  const meta = output.generation_metadata as { versions?: unknown[]; manual?: boolean; fitAnalysis?: ContentFitAnalysis } | null;
  const versionCount = Array.isArray(meta?.versions) ? meta!.versions!.length : 0;
  const isManual = Boolean(meta?.manual);
  const fitAnalysis = meta?.fitAnalysis ?? null;

  const platformLabel = PLATFORMS.find((p) => p.value === output.platform)?.label ?? output.platform;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline">{platformLabel}</Badge>
          {isManual && (
            <Badge variant="outline" className="text-[10px] border-sky-300 bg-sky-50 text-sky-700">
              직접 등록
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {versionCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              <History className="size-3" /> 이전 버전 {versionCount}개
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {output.status}
          </Badge>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const fd = new FormData();
                  fd.set("outputId", output.id);
                  fd.set("title", title);
                  fd.set("body", body);
                  await updateContentOutputAction(fd);
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 font-medium text-neutral-900">{output.title}</p>
          <p className="mt-1 text-sm text-neutral-600 whitespace-pre-wrap line-clamp-6">{output.body}</p>
          {output.hashtags && Array.isArray(output.hashtags) && (output.hashtags as string[]).length > 0 && (
            <p className="mt-2 text-xs text-sky-600">
              {(output.hashtags as string[]).map((h) => `#${h}`).join(" ")}
            </p>
          )}
        </>
      )}

      {fitAnalysis && <FitAnalysisPanel analysis={fitAnalysis} />}
      {analyzeError && <p className="mt-2 text-sm text-orange-600">{analyzeError}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> 수정
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigator.clipboard.writeText(output.body ?? "")}
        >
          <Copy className="size-3.5" /> 복사
        </Button>
        {!isManual && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await generateContentAction(output.content_project_id, [output.platform]);
                router.refresh();
              })
            }
          >
            <RefreshCw className="size-3.5" /> 다시 생성
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!hasLinkedStrategy || analyzing}
          title={hasLinkedStrategy ? undefined : "먼저 전략을 연결하세요"}
          onClick={() =>
            startAnalyzing(async () => {
              setAnalyzeError(null);
              const result = await analyzeContentFitAction(output.id);
              if (result.error) setAnalyzeError(result.error);
              router.refresh();
            })
          }
        >
          <Gauge className="size-3.5" /> {analyzing ? "분석 중..." : "전략 적합도 분석"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/performance?contentOutputId=${output.id}`)}
        >
          <TrendingUp className="size-3.5" /> 성과 등록
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => startTransition(() => deleteContentOutputAction(output.id))}
        >
          <Trash2 className="size-3.5 text-orange-500" />
        </Button>
      </div>
    </div>
  );
}
