"use client";

import { useRef, useState } from "react";
import { Check, ListPlus, Loader2, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import type { OutputSection } from "@/lib/generators/types";
import type { GeneratedContent, GeneratedValue } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge, Button, Notice, SectionCard, Tabs, Tag } from "@/components/ui";
import { ResultPanel } from "@/components/shared/ResultPanel";
import { cn } from "@/lib/utils";

const STAGE1_KEYS = new Set(["topics", "titles", "hooks", "ctas"]);
const MAX_TITLES = 5;
const asList = (v: GeneratedValue | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
/** 화면에 보이는 목록 (직접 수정했으면 수정본) */
const shown = (c: GeneratedContent, key: string) => asList(c.context.userEdits?.[key]?.value ?? c.output[key]);

/**
 * 2단계 생성 화면 (영상·클립, v0.9.40). docs/TWO_STAGE_CONTENT_GENERATION.md
 *  1단계 결과: Keyword Intelligence 요약 + 제목(여러 개)·Hook(1개)·CTA(1개) 고르기 → [선택한 제목으로 대본 만들기]
 *  2단계 결과: 제목마다 탭 — 대본 3편(카드, [추가 만들기]로 같은 제목 안에 추가)·핵심 키워드·태그·설명
 * 2단계는 제목마다 한 번씩 부르고, 실패한 제목만 다시 시도한다. 플랫폼 API 는 1단계에서만.
 */
export function TwoStageWorkspace({
  stage1,
  groups,
  outputs,
  onStage1Change,
  onGroupsChange,
}: {
  stage1: GeneratedContent;
  groups: GeneratedContent[];
  outputs: OutputSection[];
  onStage1Change: (next: GeneratedContent) => void;
  onGroupsChange: (next: GeneratedContent[]) => void;
}) {
  const titles = shown(stage1, "titles");
  const hooks = shown(stage1, "hooks");
  const ctas = shown(stage1, "ctas");
  const topics = shown(stage1, "topics");
  const top = (stage1.context.quality?.titleTop ?? []).filter((t) => titles.includes(t.title));
  const topSet = new Map(top.map((t) => [t.title, t.reason]));
  const orderedTitles = [...top.map((t) => t.title), ...titles.filter((t) => !topSet.has(t))];
  const ki = stage1.context.workflow?.keywordIntelligence ?? null;

  const [pickedTitles, setPickedTitles] = useState<string[]>([]);
  const [hook, setHook] = useState(hooks[0] ?? "");
  const [cta, setCta] = useState(ctas[0] ?? "");
  const [running, setRunning] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(groups[0]?.id ?? "");
  const busy = useRef(false);
  const stage2Outputs = outputs.filter((o) => !STAGE1_KEYS.has(o.key));
  const done = new Set(groups.map((g) => g.context.workflow?.selected?.title));

  function toggleTitle(t: string) {
    setPickedTitles((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : prev.length >= MAX_TITLES ? prev : [...prev, t]));
  }

  /** 1단계 후보 [추가 만들기] (같은 1단계 결과에 더한다, 플랫폼 API 0회) */
  async function addCandidates(key: "titles" | "hooks" | "ctas") {
    if (busy.current) return;
    busy.current = true;
    setAdding(key);
    setAddError(null);
    try {
      onStage1Change(await api.contents.regenerate(stage1.id, key));
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "추가로 만들지 못했습니다.");
    } finally {
      busy.current = false;
      setAdding(null);
    }
  }

  /** 2단계: 고른 제목마다 한 번씩 (같은 Hook·CTA). 실패한 제목은 따로 표시해 그 제목만 다시 */
  async function runStage2(list: string[]) {
    if (busy.current || !list.length) return;
    busy.current = true;
    const nextGroups = [...groups];
    for (const t of list) {
      setRunning(t);
      setFailed((prev) => {
        const n = { ...prev };
        delete n[t];
        return n;
      });
      try {
        const g = await api.contents.stage2({ stage1Id: stage1.id, title: t, hook, cta });
        nextGroups.unshift(g);
        onGroupsChange([...nextGroups]);
        setActive(g.id);
      } catch (e) {
        setFailed((prev) => ({ ...prev, [t]: e instanceof Error ? e.message : "만들지 못했습니다." }));
      }
    }
    setRunning(null);
    setPickedTitles([]);
    busy.current = false;
  }

  const activeGroup = groups.find((g) => g.id === active) ?? groups[0] ?? null;

  return (
    <div className="space-y-4" data-two-stage>
      <SectionCard
        title="1단계 · 제목 · Hook · CTA 고르기"
        icon={Sparkles}
        description="마음에 드는 제목(여러 개 가능)과 Hook·CTA 를 고르면, 2단계에서 제목마다 대본 3편·키워드·태그·설명을 만듭니다."
      >
        {ki && (
          <div className="mb-4 rounded-control border border-line bg-subtle/60 px-3.5 py-3" data-keyword-intel>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
              <Search className="size-3.5 text-fg-subtle" />
              Keyword Intelligence · &lsquo;{ki.seed}&rsquo;
              <Badge tone={ki.source === "fallback_ai" ? "warning" : "info"}>
                {ki.source === "youtube" ? `YouTube 관련 영상 ${ki.sampleSize}개` : ki.source === "naver" ? `NAVER 블로그 글 ${ki.sampleSize}개` : "AI 만으로"}
              </Badge>
              {ki.note && <span className="text-fg-subtle">{ki.note}</span>}
            </p>
            {ki.candidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {ki.candidates.slice(0, 12).map((c) => (
                  <span key={c.keyword} title={c.evidence}>
                    <Tag>{c.keyword}</Tag>
                  </span>
                ))}
              </div>
            )}
            {ki.trendSignals.length > 0 && (
              <p className="mt-2 text-[11.5px] text-fg-subtle">
                데이터랩 상대 관심도(검색량 아님):{" "}
                {ki.trendSignals.map((t) => `${t.keyword} ${t.relativeInterest}${t.direction === "up" ? "↑" : t.direction === "down" ? "↓" : ""}`).join(" · ")}
              </p>
            )}
          </div>
        )}

        {topics.length > 0 && (
          <div className="mb-4">
            <p className="text-[13px] font-semibold text-fg">추천 주제</p>
            <ul className="mt-1 space-y-0.5 text-[13px] text-fg-muted">
              {topics.map((t) => (
                <li key={t}>· {t}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-5">
          <CandidateBlock title={`제목 후보 · ${titles.length}개`} hint={`여러 개 고를 수 있습니다 (최대 ${MAX_TITLES}개)`} onAdd={() => void addCandidates("titles")} adding={adding === "titles"}>
            {orderedTitles.map((t) => {
              const on = pickedTitles.includes(t);
              return (
                <label key={t} className={cn("flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5 text-[13.5px]", on ? "bg-brand-soft/60" : "hover:bg-subtle")} data-title-option>
                  <input type="checkbox" checked={on} onChange={() => toggleTitle(t)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
                  <span className="min-w-0">
                    {topSet.has(t) && <Star className="mr-1 inline size-3.5 fill-brand text-brand" />}
                    <span className="text-fg">{t}</span>
                    {topSet.get(t) && <span className="block text-[11.5px] text-fg-subtle">{topSet.get(t)}</span>}
                    {done.has(t) && <span className="ml-1.5 text-[11px] font-medium text-success">대본 있음</span>}
                    {failed[t] && <span className="block text-[11.5px] text-danger">{failed[t]}</span>}
                  </span>
                </label>
              );
            })}
          </CandidateBlock>
          <div className="grid gap-5 md:grid-cols-2">
            <CandidateBlock title={`Hook 후보 · ${hooks.length}개`} hint="1개 고르기 — 대본 첫 줄" onAdd={() => void addCandidates("hooks")} adding={adding === "hooks"}>
              {hooks.map((h) => (
                <RadioRow key={h} name={`hook-${stage1.id}`} checked={hook === h} onChange={() => setHook(h)} text={h} />
              ))}
            </CandidateBlock>
            <CandidateBlock title={`CTA 후보 · ${ctas.length}개`} hint="1개 고르기 — 대본 마지막" onAdd={() => void addCandidates("ctas")} adding={adding === "ctas"}>
              {ctas.map((c) => (
                <RadioRow key={c} name={`cta-${stage1.id}`} checked={cta === c} onChange={() => setCta(c)} text={c} />
              ))}
            </CandidateBlock>
          </div>
        </div>
        {addError && <Notice tone="warning" className="mt-3">{addError}</Notice>}

        <div className="sticky bottom-2 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-canvas/95 px-4 py-3 shadow-card backdrop-blur">
          <span className="text-[13px] text-fg-muted">
            제목 {pickedTitles.length}개 · Hook {hook ? "선택" : "없음"} · CTA {cta ? "선택" : "없음"}
            {running && (
              <span className="ml-2 inline-flex items-center gap-1 text-brand">
                <Loader2 className="size-3.5 animate-spin" />
                &lsquo;{running.slice(0, 18)}&rsquo; 대본 만드는 중
              </span>
            )}
          </span>
          <div className="flex gap-2">
            {Object.keys(failed).length > 0 && !running && (
              <Button size="sm" icon={RefreshCw} onClick={() => void runStage2(Object.keys(failed))}>
                실패한 제목 다시
              </Button>
            )}
            <Button variant="primary" icon={ListPlus} loading={Boolean(running)} disabled={!pickedTitles.length || Boolean(running)} onClick={() => void runStage2(pickedTitles)} data-run-stage2>
              선택한 제목 {pickedTitles.length || ""}개로 대본 만들기
            </Button>
          </div>
        </div>
      </SectionCard>

      {groups.length > 0 && activeGroup && (
        <div className="space-y-3" data-stage2-groups>
          <Tabs
            items={groups.map((g, i) => ({ value: g.id, label: `${i + 1}. ${(g.context.workflow?.selected?.title ?? g.headline).slice(0, 18)}` }))}
            value={activeGroup.id}
            onChange={setActive}
          />
          <div className="rounded-card border border-line bg-subtle/50 px-4 py-3 text-[13px]">
            <p className="font-semibold text-fg">
              <Check className="mr-1 inline size-4 text-success" />
              {activeGroup.context.workflow?.selected?.title}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              Hook · {activeGroup.context.workflow?.selected?.hook || "-"} &nbsp;/&nbsp; CTA · {activeGroup.context.workflow?.selected?.cta || "-"}
            </p>
            {activeGroup.context.workflow?.primaryKeyword && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Badge tone="brand">핵심 · {activeGroup.context.workflow.primaryKeyword}</Badge>
                {(activeGroup.context.workflow.relatedKeywords ?? []).slice(0, 10).map((k) => (
                  <span key={k.keyword} title={`검색 의도: ${k.intent}`}>
                    <Tag>{k.keyword}</Tag>
                  </span>
                ))}
              </div>
            )}
          </div>
          <ResultPanel content={activeGroup} outputs={stage2Outputs} onChange={(next) => onGroupsChange(groups.map((g) => (g.id === next.id ? next : g)))} />
        </div>
      )}
    </div>
  );
}

function CandidateBlock({ title, hint, onAdd, adding, children }: { title: string; hint: string; onAdd: () => void; adding: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] font-semibold text-fg">
          {title}
          <span className="block text-xs font-normal text-fg-subtle">{hint}</span>
        </p>
        <Button size="sm" variant="ghost" icon={ListPlus} loading={adding} onClick={onAdd}>
          추가 만들기
        </Button>
      </div>
      <div className="max-h-[360px] space-y-0.5 overflow-y-auto">{children}</div>
    </div>
  );
}

function RadioRow({ name, checked, onChange, text }: { name: string; checked: boolean; onChange: () => void; text: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5 text-[13px]", checked ? "bg-brand-soft/60 text-fg" : "text-fg-muted hover:bg-subtle")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
      <span>{text}</span>
    </label>
  );
}
