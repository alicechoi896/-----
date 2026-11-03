"use client";

import { useRef, useState } from "react";
import { CalendarPlus, Check, Film, ListPlus, Loader2, RefreshCw, Search, Sparkles, Star } from "lucide-react";
import type { OutputSection } from "@/lib/generators/types";
import type { GeneratedContent, GeneratedValue } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge, Button, Input, Notice, SectionCard, Tabs, Tag } from "@/components/ui";
import { ResultPanel } from "@/components/shared/ResultPanel";
import { AskRegenerate } from "@/components/shared/AskRegenerate";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { PublicationForm } from "@/features/uploads/PublicationForm";
import { THUMB_MAX, cutThumb, thumbLen } from "@/lib/video-production/thumb";

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
  // v0.9.153 후보가 따라 한 대본 포맷 원문 (있을 때만)
  const refs = stage1.context.quality?.formatRefs;
  const formatName = stage1.context.scriptFormat?.name ?? null;

  const [pickedTitles, setPickedTitles] = useState<string[]>([]);
  const [hook, setHook] = useState(hooks[0] ?? "");
  const [cta, setCta] = useState(ctas[0] ?? "");
  const [running, setRunning] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [active, setActive] = useState<string>(groups[0]?.id ?? "");
  // 2단계 결과가 있으면 1단계(고르기)는 접고 최종 결과 화면만 보여 준다 (v0.9.49)
  const [pickOpen, setPickOpen] = useState(groups.length === 0);
  const busy = useRef(false);
  // 제목별 결과 [업로드 예약하기] (v0.9.48)
  const [scheduleFor, setScheduleFor] = useState<GeneratedContent | null>(null);
  const [scheduledIds, setScheduledIds] = useState<Record<string, string>>({});
  const stage2Outputs = outputs.filter((o) => !STAGE1_KEYS.has(o.key));
  const done = new Set(groups.map((g) => g.context.workflow?.selected?.title));

  function toggleTitle(t: string) {
    setPickedTitles((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : prev.length >= MAX_TITLES ? prev : [...prev, t]));
  }

  /** 1단계 후보 [추가 만들기] (같은 1단계 결과에 더한다, 플랫폼 API 0회) */
  async function addCandidates(key: "titles" | "hooks" | "ctas", ask?: string) {
    if (busy.current) return;
    busy.current = true;
    setAdding(key);
    setAddError(null);
    try {
      onStage1Change(await api.contents.regenerate(stage1.id, key, ask));
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
    if (nextGroups.length > groups.length) setPickOpen(false);
  }

  const activeGroup = groups.find((g) => g.id === active) ?? groups[0] ?? null;

  return (
    <div className="space-y-4" data-two-stage>
      {!pickOpen && groups.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-subtle/50 px-4 py-3" data-stage1-collapsed>
          <p className="text-[13px] text-fg-muted">
            <Check className="mr-1 inline size-4 text-success" />
            1단계 완료 · 제목 {groups.length}개로 대본을 만들었습니다. 아래 최종 결과를 확인하고 업로드를 예약하세요.
          </p>
          <Button size="sm" variant="ghost" icon={ListPlus} onClick={() => setPickOpen(true)}>
            다른 제목으로 더 만들기
          </Button>
        </div>
      )}
      {pickOpen && (
      <SectionCard
        title="1단계 · 제목 · Hook · CTA 고르기"
        icon={Sparkles}
        description="마음에 드는 제목(여러 개 가능)과 Hook·CTA 를 고르면, 2단계에서 제목마다 대본 3편·키워드·태그·설명을 만듭니다."
      >
        {formatName && refs && (
          <p className="mb-3 text-[12.5px] text-fg-muted" data-format-follow>
            대본 포맷 <b>&lsquo;{formatName}&rsquo;</b> 참고 · 제목 {titles.filter((t) => refs.titles[t]).length}/{titles.length}개, Hook {hooks.filter((h) => refs.hooks[h]).length}/{hooks.length}개가 포맷 문장 구조를 따랐습니다 (파란 글씨 = 따라 한 원문).
          </p>
        )}
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
          <CandidateBlock title={`제목 후보 · ${titles.length}개`} hint={`여러 개 고를 수 있습니다 (최대 ${MAX_TITLES}개)`} onAdd={() => void addCandidates("titles")} adding={adding === "titles"} ask={{ contentId: stage1.id, label: "제목", onRun: (r) => addCandidates("titles", r) }}>
            {orderedTitles.map((t) => {
              const on = pickedTitles.includes(t);
              return (
                <label key={t} className={cn("flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5 text-[13.5px]", on ? "bg-brand-soft/60" : "hover:bg-subtle")} data-title-option>
                  <input type="checkbox" checked={on} onChange={() => toggleTitle(t)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
                  <span className="min-w-0">
                    {topSet.has(t) && <Star className="mr-1 inline size-3.5 fill-brand text-brand" />}
                    <span className="text-fg">{t}</span>
                    {topSet.get(t) && <span className="block text-[11.5px] text-fg-subtle">{topSet.get(t)}</span>}
                    {refs?.titles[t] && <FormatRef model={refs.titles[t]} />}
                    {done.has(t) && <span className="ml-1.5 text-[11px] font-medium text-success">대본 있음</span>}
                    {failed[t] && <span className="block text-[11.5px] text-danger">{failed[t]}</span>}
                  </span>
                </label>
              );
            })}
          </CandidateBlock>
          <div className="grid gap-5 md:grid-cols-2">
            <CandidateBlock title={`Hook 후보 · ${hooks.length}개`} hint="1개 고르기 — 대본 첫 줄" onAdd={() => void addCandidates("hooks")} adding={adding === "hooks"} ask={{ contentId: stage1.id, label: "Hook", onRun: (r) => addCandidates("hooks", r) }}>
              {hooks.map((h) => (
                <RadioRow key={h} name={`hook-${stage1.id}`} checked={hook === h} onChange={() => setHook(h)} text={h} sub={refs?.hooks[h] ? <FormatRef model={refs.hooks[h]} /> : null} />
              ))}
            </CandidateBlock>
            <CandidateBlock title={`CTA 후보 · ${ctas.length}개`} hint="1개 고르기 — 대본 마지막" onAdd={() => void addCandidates("ctas")} adding={adding === "ctas"} ask={{ contentId: stage1.id, label: "CTA", onRun: (r) => addCandidates("ctas", r) }}>
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
        {groups.length > 0 && (
          <div className="mt-3 text-right">
            <Button size="sm" variant="ghost" onClick={() => setPickOpen(false)}>
              1단계 접기
            </Button>
          </div>
        )}
      </SectionCard>
      )}

      {groups.length > 0 && activeGroup && (
        <div className="space-y-3" data-stage2-groups>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-fg">
            <Sparkles className="size-4 text-brand" />
            2단계 · 최종 결과 <span className="text-xs font-normal text-fg-subtle">제목마다 대본·키워드·태그·설명 — 확인한 뒤 업로드를 예약하세요</span>
          </h2>
          <Tabs
            items={groups.map((g, i) => ({ value: g.id, label: `${i + 1}. ${(g.context.workflow?.selected?.title ?? g.headline).slice(0, 18)}` }))}
            value={activeGroup.id}
            onChange={setActive}
          />
          <div className="rounded-card border border-line bg-subtle/50 px-4 py-3 text-[13px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 font-semibold text-fg">
                <Check className="mr-1 inline size-4 text-success" />
                {activeGroup.context.workflow?.selected?.title}
              </p>
              <span className="flex shrink-0 items-center gap-2">
                {scheduledIds[activeGroup.id] && (
                  <Link href="/uploads" className="text-xs font-medium text-brand hover:underline">
                    {scheduledIds[activeGroup.id]} · 업로드 관리 보기
                  </Link>
                )}
                <Link
                  href={`/${stage1.featureId.startsWith("yt-") ? "youtube" : "naver-clip"}/video-production?contentId=${activeGroup.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-4 text-[13.5px] font-semibold text-white shadow-card hover:bg-brand-hover"
                  data-make-video
                >
                  <Film className="size-4" />
                  이 제목으로 영상 만들기
                </Link>
                <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setScheduleFor(activeGroup)} data-schedule-upload-group>
                  이 제목 업로드 예약하기
                </Button>
              </span>
            </div>
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
          {scheduleFor && (
            <PublicationForm
              open
              onClose={() => setScheduleFor(null)}
              editing={null}
              presetContent={scheduleFor}
              presetStatus="scheduled"
              onSaved={(p) => {
                const at = p.scheduledAt ?? p.publishedAt;
                setScheduledIds((prev) => ({ ...prev, [scheduleFor.id]: `${p.status === "scheduled" ? "예약됨" : "등록됨"}${at ? ` · ${new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}` }));
                setScheduleFor(null);
              }}
            />
          )}
          {/* v0.9.146 섬네일 제목은 결과 목록 대신 이 칸에서 고르고 고친다 (고른 것이 영상 상단 제목 2번째 줄) */}
          {shown(activeGroup, "thumbnailTitles").length > 0 && (
            <SectionCard title="섬네일 제목 (고르기·고치기)" icon={Star} description="후보를 누르면 그 문구로 정해지고, 직접 고쳐 저장할 수도 있습니다. 고른 섬네일 제목은 이 원고로 영상을 만들 때 상단 제목 2번째 줄에 들어갑니다." data-thumb-card>
              <ThumbPicker key={activeGroup.id} content={activeGroup} onChange={(next) => onGroupsChange(groups.map((g) => (g.id === next.id ? next : g)))} />
              <div className="mt-2">
                <AskRegenerate
                  contentId={activeGroup.id}
                  label="섬네일 제목"
                  onRun={async (r) => {
                    const next = await api.contents.regenerate(activeGroup.id, "thumbnailTitles", r);
                    onGroupsChange(groups.map((g) => (g.id === next.id ? next : g)));
                  }}
                />
              </div>
            </SectionCard>
          )}
          <ResultPanel content={activeGroup} outputs={stage2Outputs.filter((o) => o.key !== "thumbnailTitles")} onChange={(next) => onGroupsChange(groups.map((g) => (g.id === next.id ? next : g)))} />
        </div>
      )}
    </div>
  );
}

/**
 * v0.9.138 섬네일 제목 고르기·고치기 — 고른 것이 영상 만들기의 섬네일 제목(영상 상단 제목 2번째 줄)이 된다.
 * 고르기 = picks.thumbnailTitles, 고치기 = userEdits.thumbnailTitles (후보 목록에서 그 문구만 바꿔 저장)
 */
function ThumbPicker({ content, onChange }: { content: GeneratedContent; onChange: (c: GeneratedContent) => void }) {
  const list = shown(content, "thumbnailTitles").map(String);
  const picked = content.context.picks?.thumbnailTitles?.values?.[0] ?? null;
  const [text, setText] = useState(picked ?? list.find((t) => thumbLen(t) <= THUMB_MAX) ?? list[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function save(value: string) {
    const v = cutThumb(value);
    if (!v) return;
    setBusy(true);
    setNote(null);
    try {
      let next = content;
      // 후보에 없는 문구면(고친 것) 후보 목록에 넣어 저장
      if (!list.includes(v)) next = await api.contents.annotate(content.id, { edit: { key: "thumbnailTitles", value: [v, ...list.filter((x) => x !== picked)].slice(0, 12) } });
      next = await api.contents.annotate(content.id, { pick: { key: "thumbnailTitles", values: [v] } });
      setText(v);
      onChange(next);
      setNote("섬네일 제목을 저장했습니다. 이 원고로 영상을 만들면 상단 제목 2번째 줄에 들어갑니다.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2" data-thumb-picker>
      <p className="text-[12px] text-fg-subtle">공백 빼고 {THUMB_MAX}자 이내 · 지금 고른 것: <b className="text-fg">{picked ?? "(아직 안 고름 — 첫 후보를 씀)"}</b></p>
      <div className="flex flex-wrap gap-1">
        {list.map((t) => (
          <button key={t} type="button" disabled={busy} onClick={() => void save(t)} className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", picked === t ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-fg-muted hover:border-brand-line", thumbLen(t) > THUMB_MAX && "opacity-60")} title={thumbLen(t) > THUMB_MAX ? `${thumbLen(t)}자 — 고르면 ${THUMB_MAX}자로 자릅니다` : undefined}>
            {picked === t && <Check className="mr-0.5 inline size-3" />}
            {t}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} className="h-8 max-w-xs text-[13px]" aria-label="섬네일 제목 고치기" />
        <span className={cn("text-[11.5px]", thumbLen(text) > THUMB_MAX ? "text-danger" : "text-fg-subtle")}>
          {thumbLen(text)}/{THUMB_MAX}
        </span>
        <Button size="sm" variant="secondary" loading={busy} disabled={!text.trim() || cutThumb(text) === picked} onClick={() => void save(text)}>
          이 문구로 저장
        </Button>
      </div>
      {note && <p className="text-[11.5px] text-fg-muted">{note}</p>}
    </div>
  );
}

function CandidateBlock({ title, hint, onAdd, adding, children, ask }: { title: string; hint: string; onAdd: () => void; adding: boolean; children: React.ReactNode; ask?: { contentId: string; label: string; onRun: (r: string) => Promise<void> } }) {
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-[13px] font-semibold text-fg">
          {title}
          <span className="block text-xs font-normal text-fg-subtle">{hint}</span>
        </p>
        <span className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" icon={ListPlus} loading={adding} onClick={onAdd}>
            추가 만들기
          </Button>
          {ask && <AskRegenerate contentId={ask.contentId} label={ask.label} onRun={ask.onRun} />}
        </span>
      </div>
      <div className="max-h-[360px] space-y-0.5 overflow-y-auto">{children}</div>
    </div>
  );
}

/** "포맷 따라 씀: 원문" 표시 */
function FormatRef({ model }: { model: string }) {
  return (
    <span className="mt-0.5 block text-[11.5px] text-brand" title="대본 포맷의 이 문장 구조를 따라 단어만 바꿨습니다" data-format-ref>
      포맷 따라 씀: {model}
    </span>
  );
}

function RadioRow({ name, checked, onChange, text, sub }: { name: string; checked: boolean; onChange: () => void; text: string; sub?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-control px-2 py-1.5 text-[13px]", checked ? "bg-brand-soft/60 text-fg" : "text-fg-muted hover:bg-subtle")}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
      <span>
        {text}
        {sub}
      </span>
    </label>
  );
}
