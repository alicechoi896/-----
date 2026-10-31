"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, History, Loader2, Save } from "lucide-react";
import { Badge, Button, Drawer, ErrorState, Input, LoadingState, Notice } from "@/components/ui";
import { STEPS, STEP_STATUS_LABEL, canEnter, progressOf, stepIndex } from "@/lib/drama-studio/steps";
import type { StepKey } from "@/lib/drama-studio/types";
import { cn, formatRelative } from "@/lib/utils";
import { useProject, type ProjectCtl } from "./useProject";
import { studioApi } from "./api";
import { IdeasStep } from "./steps/IdeasStep";
import { SelectStep } from "./steps/SelectStep";
import { StoryStep } from "./steps/StoryStep";
import { CharactersStep } from "./steps/CharactersStep";
import { SheetsStep } from "./steps/SheetsStep";
import { ScenarioStep } from "./steps/ScenarioStep";
import { StoryboardStep } from "./steps/StoryboardStep";
import { VideoStep } from "./steps/VideoStep";

const SAVE_LABEL = { saved: "저장됨", saving: "저장 중…", dirty: "저장 대기", error: "저장 안 됨" } as const;

/** 작업실: 상단(이름·저장 상태·진행) → 8단계 → 지금 단계 화면 → 아래(이전·저장·승인 후 다음) */
export function StudioShell({ id, onClose }: { id: string; onClose: () => void }) {
  const ctl = useProject(id);
  const { project: p, saveState, error, busy } = ctl;
  const [history, setHistory] = useState(false);
  if (!p) return error ? <ErrorState message={error} onRetry={() => void ctl.reload()} /> : <LoadingState label="프로젝트를 불러오는 중입니다…" className="py-24" />;
  const step = p.currentStep;
  const i = stepIndex(step);
  const st = p.steps[step];
  const prog = progressOf(p);
  const go = (k: StepKey) => {
    if (canEnter(p, k)) ctl.edit("currentStep", k);
  };
  return (
    <div className="space-y-4" data-studio={p.id}>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-canvas px-4 py-3">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => void ctl.flush().then(onClose)}>
          프로젝트 목록
        </Button>
        <span className="text-[12px] font-semibold text-brand">AI 드라마 스튜디오</span>
        <Input value={p.title} onChange={(e) => ctl.edit("title", e.target.value)} className="h-8 max-w-xs font-semibold" aria-label="프로젝트 이름" />
        <Badge tone={saveState === "error" ? "danger" : saveState === "saved" ? "success" : "info"}>{SAVE_LABEL[saveState]}</Badge>
        <span className="text-[12px] text-fg-subtle" data-progress>
          승인 {prog.approved}/{prog.total}
          {prog.storyboard.total ? ` · 스토리보드 ${prog.storyboard.done}/${prog.storyboard.total}` : ""}
          {prog.clips.total ? ` · 영상 ${prog.clips.done}/${prog.clips.total}` : ""}
          {p.renders.at(-1) ? ` · 최종 병합 ${p.renders.at(-1)!.status === "success" ? "완료" : p.renders.at(-1)!.status === "running" ? "진행 중" : "실패"}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={History} onClick={() => setHistory(true)}>
            승인 기록
          </Button>
          <a href={`/api/drama-studio/${p.id}/export`} className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-[13px] text-fg-muted hover:bg-muted hover:text-fg" data-export>
            <Download className="size-4" /> 기획 내보내기
          </a>
        </span>
      </div>

      <nav className="grid grid-cols-4 gap-1.5 md:grid-cols-8" aria-label="제작 단계" data-step-nav>
        {STEPS.map((s) => {
          const ok = canEnter(p, s.key);
          const ss = p.steps[s.key];
          return (
            <button
              key={s.key}
              type="button"
              disabled={!ok}
              onClick={() => go(s.key)}
              className={cn("rounded-control border px-2 py-2 text-left transition", s.key === step ? "border-brand bg-brand-soft/60" : "border-line bg-canvas hover:bg-subtle", !ok && "cursor-not-allowed opacity-45")}
              data-step={s.key}
            >
              <span className="block text-[11px] text-fg-subtle">{s.no}</span>
              <span className="block truncate text-[13px] font-semibold text-fg">{s.label}</span>
              <span className={cn("mt-0.5 inline-block text-[10.5px]", ss.status === "approved" ? "text-success" : ss.status === "review" ? "text-warning" : "text-fg-subtle")}>{STEP_STATUS_LABEL[ss.status]}</span>
            </button>
          );
        })}
      </nav>

      {st.status === "review" && (
        <Notice tone="warning">
          앞 단계가 바뀌었습니다. 이 단계 결과가 바뀐 내용과 맞는지 확인해 주세요 (결과는 지우지 않았습니다). 이 알림이 있어도 작업은 계속할 수 있습니다.{" "}
          <Button size="sm" variant="secondary" className="ml-1" disabled={Boolean(busy)} onClick={() => void ctl.run("확인", () => studioApi.generate(p.id, "ack-review", { step }))} data-ack-review>
            확인했어요
          </Button>
        </Notice>
      )}
      {error && (
        <Notice tone="warning">
          {error}{" "}
          <button type="button" className="underline" onClick={() => ctl.setError(null)}>
            닫기
          </button>
        </Notice>
      )}
      {busy && (
        <p className="flex items-center gap-2 text-[13px] font-medium text-brand" data-busy>
          <Loader2 className="size-4 animate-spin" /> {busy} 중… (AI 글 생성은 수십 초 걸릴 수 있습니다)
        </p>
      )}

      <StepBody step={step} ctl={ctl} />

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas/95 px-4 py-3 backdrop-blur" data-step-actions>
        <Button size="sm" variant="secondary" icon={ArrowLeft} disabled={i === 0} onClick={() => go(STEPS[i - 1].key)}>
          이전 단계
        </Button>
        <Button size="sm" variant="secondary" icon={Save} onClick={() => void ctl.flush()} disabled={saveState === "saved"}>
          저장
        </Button>
        <span className="text-[12px] text-fg-subtle">
          {STEPS[i].no} {STEPS[i].label} · {STEP_STATUS_LABEL[st.status]}
          {st.approvedAt ? ` · v${st.version} 승인 ${formatRelative(st.approvedAt)}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {st.status === "approved" && STEPS[i + 1] && (
            <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => go(STEPS[i + 1].key)}>
              다음 단계
            </Button>
          )}
          <Button size="sm" variant="primary" icon={Check} loading={busy === "승인"} disabled={Boolean(busy)} onClick={() => void ctl.approve(step)} data-approve>
            {st.status === "approved" ? "다시 승인" : i < STEPS.length - 1 ? "승인 후 다음 단계" : "최종 승인"}
          </Button>
        </span>
      </div>

      <Drawer open={history} onClose={() => setHistory(false)} title="승인 기록 (단계마다 승인한 시점의 내용)">
        <ApprovalHistory ctl={ctl} />
      </Drawer>
    </div>
  );
}

function ApprovalHistory({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const [open, setOpen] = useState<number | null>(null);
  if (!p.approvals.length) return <p className="text-[13px] text-fg-subtle">아직 승인한 단계가 없습니다.</p>;
  return (
    <ul className="space-y-2" data-approval-history>
      {[...p.approvals].reverse().map((a, k) => (
        <li key={`${a.step}-${a.version}-${a.at}`} className="rounded-control border border-line p-2.5">
          <button type="button" className="flex w-full items-center justify-between text-left text-[13px]" onClick={() => setOpen(open === k ? null : k)}>
            <span className="font-medium text-fg">
              {STEPS.find((s) => s.key === a.step)?.no} {STEPS.find((s) => s.key === a.step)?.label} · v{a.version}
            </span>
            <span className="text-[12px] text-fg-subtle">{formatRelative(a.at)}</span>
          </button>
          {open === k && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-subtle p-2 text-[11.5px] text-fg-muted">{JSON.stringify(a.snapshot, null, 2)}</pre>}
        </li>
      ))}
    </ul>
  );
}

function StepBody({ step, ctl }: { step: StepKey; ctl: ProjectCtl }) {
  switch (step) {
    case "ideas":
      return <IdeasStep ctl={ctl} />;
    case "select":
      return <SelectStep ctl={ctl} />;
    case "story":
      return <StoryStep ctl={ctl} />;
    case "characters":
      return <CharactersStep ctl={ctl} />;
    case "sheets":
      return <SheetsStep ctl={ctl} />;
    case "scenario":
      return <ScenarioStep ctl={ctl} />;
    case "storyboard":
      return <StoryboardStep ctl={ctl} />;
    case "video":
      return <VideoStep ctl={ctl} />;
  }
}
