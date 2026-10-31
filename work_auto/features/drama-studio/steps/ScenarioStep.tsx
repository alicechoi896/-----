"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, BookText, ClipboardPaste, History, LayoutGrid, Plus, RefreshCw, Save, ScrollText, Sparkles, Trash2 } from "lucide-react";
import { Button, EmptyState, IconButton, Input, SectionCard, Select, SegmentedControl, Textarea } from "@/components/ui";
import { MAX_SCENES, defaultSceneCount, emptyScene, fitDurations } from "@/lib/drama-studio/steps";
import type { DramaScenario, DramaScene } from "@/lib/drama-studio/types";
import { cn, formatRelative } from "@/lib/utils";
import { studioApi } from "../api";
import { TextField } from "../ui";
import type { ProjectCtl } from "../useProject";

const SCENE_FIELDS: { k: keyof DramaScene; label: string; rows: number }[] = [
  { k: "action", label: "인물 행동", rows: 2 },
  { k: "dialogue", label: "대사 ('이름: 대사' 한 줄씩)", rows: 3 },
  { k: "emotion", label: "감정 변화", rows: 1 },
  { k: "camera", label: "카메라 연출", rows: 1 },
  { k: "visual", label: "화면 묘사", rows: 2 },
  { k: "sound", label: "효과음·음악", rows: 1 },
  { k: "continuity", label: "연속성 (소품·의상·시간대)", rows: 1 },
];
const ENDINGS = ["반전 결말", "해피 엔딩", "새드 엔딩", "열린 결말", "다음 편 예고"];

/** 06 시나리오: 설정 → AI 작성(줄거리 + 장면 25개 기본) → 전체 읽기·장면 카드에서 고치기 → 버전 저장 → 승인 */
export function ScenarioStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const sc = p.scenario;
  const [view, setView] = useState<"cards" | "read">("cards");
  const [paste, setPaste] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const set = (patch: Partial<DramaScenario>) => ctl.edit("scenario", { ...sc, ...patch });
  const setScene = (id: string, patch: Partial<DramaScene>) => set({ scenes: sc.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const move = (i: number, d: -1 | 1) => {
    const list = [...sc.scenes];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ scenes: list });
  };
  const total = sc.scenes.reduce((n, s) => n + (s.durationSec || 0), 0);
  const name = (id: string) => p.characters.find((c) => c.id === id)?.name ?? "?";
  return (
    <div className="space-y-5">
      <SectionCard title="시나리오 설정" icon={ScrollText}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">장면 수 (권장 {defaultSceneCount(p.settings.targetSec)} = 길이÷8초)</span>
            <Input type="number" min={3} max={MAX_SCENES} value={sc.sceneCount || defaultSceneCount(p.settings.targetSec)} onChange={(e) => set({ sceneCount: Math.min(MAX_SCENES, Math.max(3, Number(e.target.value) || defaultSceneCount(p.settings.targetSec))) })} className="h-9 w-24" />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">결말 유형</span>
            <Select value={sc.endingType} options={ENDINGS.map((x) => ({ value: x, label: x }))} onChange={(e) => set({ endingType: e.target.value })} className="w-36" aria-label="결말 유형" />
          </label>
          <div className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">중심</span>
            <SegmentedControl size="sm" value={sc.style} onChange={(v) => set({ style: v })} options={[{ value: "dialogue", label: "대사 중심" }, { value: "visual", label: "영상 연출 중심" }]} />
          </div>
          <span className="text-[12px] text-fg-subtle">
            {p.settings.genre} · {p.settings.mood} · {p.settings.aspect} · 목표 {p.settings.targetSec}초
          </span>
          {sc.scenes.length > 0 && (
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">
                장면 길이 합계 <b className={Math.abs(total - p.settings.targetSec) > 3 ? "text-warning" : "text-success"}>{total}초</b> / 목표 {p.settings.targetSec}초
              </span>
              <Button size="sm" variant={Math.abs(total - p.settings.targetSec) > 3 ? "primary" : "secondary"} onClick={() => set({ scenes: fitDurations(sc.scenes, p.settings.targetSec) })} data-fit-durations>
                목표 {p.settings.targetSec}초에 맞추기
              </Button>
              {sc.scenes.length * 15 < p.settings.targetSec && (
                <span className="block text-[11.5px] text-warning">장면 {sc.scenes.length}개로는 최대 {sc.scenes.length * 15}초입니다 (장면당 최대 15초). {p.settings.targetSec}초를 채우려면 장면을 {Math.ceil(p.settings.targetSec / 15)}개 이상으로 늘려 주세요.</span>
              )}
            </div>
          )}
          <Button variant="primary" icon={Sparkles} className="ml-auto" disabled={Boolean(ctl.busy)} loading={ctl.busy === "시나리오 작성"} onClick={() => void ctl.run("시나리오 작성", () => studioApi.generate(p.id, "scenario", { sceneCount: sc.sceneCount || defaultSceneCount(p.settings.targetSec), style: sc.style, endingType: sc.endingType }))} data-gen-scenario>
            {sc.scenes.length ? "전체 다시 쓰기" : "AI 로 시나리오 쓰기"}
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">장면 하나 = 한 번에 찍는 행동 하나(6~12초)로 씁니다. 장면이 너무 많으면 행동이 중간에 끊기니 권장 수를 쓰세요. 줄거리를 먼저 잡고 장면을 8개씩 나눠 동시에 씁니다. 다시 쓰면 지금 시나리오는 자동으로 버전에 보관합니다.</p>
        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-fg-muted">
            <ClipboardPaste className="size-3.5" /> 이미 쓴 시나리오 붙여 넣기 (장면으로 나누기)
          </summary>
          <Textarea rows={6} className="mt-2" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="시나리오 글을 붙여 넣으세요. AI 가 내용을 지어내지 않고 장면 단위로 정리합니다." />
          <Button size="sm" variant="secondary" className="mt-2" disabled={paste.trim().length < 20 || Boolean(ctl.busy)} onClick={() => void ctl.run("시나리오 정리", () => studioApi.generate(p.id, "parse-scenario", { text: paste }))}>
            장면으로 나누기 (AI 1회)
          </Button>
        </details>
      </SectionCard>

      {!sc.scenes.length ? (
        <SectionCard>
          <EmptyState icon={BookText} title="장면이 없습니다" description="AI 로 쓰거나, 붙여 넣거나, 장면을 직접 추가해 주세요." action={<Button variant="secondary" icon={Plus} onClick={() => set({ scenes: [emptyScene({ title: "장면 1" })] })}>장면 직접 추가</Button>} className="py-12" />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="작품 개요" icon={BookText}>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="작품 제목" value={sc.title} onChange={(v) => set({ title: v })} />
              <TextField label="반전" value={sc.twist} onChange={(v) => set({ twist: v })} />
              <TextField label="전체 줄거리" rows={3} value={sc.synopsis} onChange={(v) => set({ synopsis: v })} className="md:col-span-2" />
              {(["setup", "development", "crisis", "climax", "ending"] as const).map((k) => (
                <TextField key={k} label={{ setup: "발단", development: "전개", crisis: "위기", climax: "절정", ending: "결말" }[k]} rows={2} value={sc.acts[k]} onChange={(v) => set({ acts: { ...sc.acts, [k]: v } })} />
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={`장면 ${sc.scenes.length}개 · 합계 ${total}초 / 목표 ${p.settings.targetSec}초`}
            icon={LayoutGrid}
            actions={
              <span className="flex items-center gap-1.5">
                <SegmentedControl size="sm" value={view} onChange={setView} options={[{ value: "cards", label: "장면 카드" }, { value: "read", label: "전체 읽기" }]} />
                <Button size="sm" variant="ghost" icon={Save} disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("버전 저장", () => studioApi.generate(p.id, "save-version", { label: `버전 ${p.scenarioVersions.length + 1}` }))}>
                  버전 저장
                </Button>
              </span>
            }
          >
            {view === "read" ? (
              <article className="space-y-4 text-[13.5px] leading-relaxed text-fg" data-scenario-read>
                {sc.scenes.map((s, i) => (
                  <section key={s.id}>
                    <h4 className="font-semibold">
                      S#{i + 1}. {s.title} <span className="font-normal text-fg-subtle">— {s.location} · {s.timeOfDay} · {s.durationSec}초</span>
                    </h4>
                    <p className="text-fg-muted">{s.action}</p>
                    {s.dialogue && <pre className="mt-1 whitespace-pre-wrap font-sans">{s.dialogue}</pre>}
                    <p className="text-[12px] text-fg-subtle">
                      [{s.characterIds.map(name).join(", ")}] {s.emotion} · {s.camera} · {s.sound}
                    </p>
                  </section>
                ))}
              </article>
            ) : (
              <ol className="space-y-3" data-scenes>
                {sc.scenes.map((s, i) => (
                  <li key={s.id} className="rounded-control border border-line p-3" data-scene={s.id}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="tabular text-[13px] font-bold text-brand">#{i + 1}</span>
                      <Input value={s.title} onChange={(e) => setScene(s.id, { title: e.target.value })} className="h-8 w-48 font-semibold" aria-label="장면 제목" />
                      <Input value={s.location} onChange={(e) => setScene(s.id, { location: e.target.value })} placeholder="장소" className="h-8 w-32" aria-label="장소" />
                      <Input value={s.timeOfDay} onChange={(e) => setScene(s.id, { timeOfDay: e.target.value })} placeholder="시간대" className="h-8 w-20" aria-label="시간대" />
                      <label className="flex items-center gap-1 text-[12px] text-fg-muted">
                        <Input type="number" min={1} max={30} value={s.durationSec} onChange={(e) => setScene(s.id, { durationSec: Math.max(1, Math.min(30, Number(e.target.value) || 5)) })} className="h-8 w-16" aria-label="길이" />초
                      </label>
                      <span className="ml-auto flex">
                        <IconButton icon={ArrowUp} label="위로" disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton icon={ArrowDown} label="아래로" disabled={i === sc.scenes.length - 1} onClick={() => move(i, 1)} />
                        <IconButton icon={Plus} label="아래에 장면 추가" onClick={() => set({ scenes: [...sc.scenes.slice(0, i + 1), emptyScene({ title: `새 장면`, location: s.location, timeOfDay: s.timeOfDay, characterIds: s.characterIds }), ...sc.scenes.slice(i + 1)] })} />
                        <IconButton icon={Trash2} label="장면 삭제" onClick={() => window.confirm(`#${i + 1} 장면을 지울까요?`) && set({ scenes: sc.scenes.filter((x) => x.id !== s.id) })} />
                      </span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {p.characters.map((c) => {
                        const on = s.characterIds.includes(c.id);
                        return (
                          <button key={c.id} type="button" onClick={() => setScene(s.id, { characterIds: on ? s.characterIds.filter((x) => x !== c.id) : [...s.characterIds, c.id] })} className={cn("rounded-full border px-2 py-0.5 text-[11.5px]", on ? "border-brand bg-brand-soft text-brand" : "border-line text-fg-subtle")}>
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {SCENE_FIELDS.map((f) => (
                        <TextField key={f.k} label={f.label} rows={f.rows > 1 ? f.rows : 0} value={String(s[f.k] ?? "")} onChange={(v) => setScene(s.id, { [f.k]: v })} />
                      ))}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Input value={notes[s.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))} placeholder="다시 쓸 때 요청 (선택, 예: 대사를 더 짧게)" className="h-8 flex-1" />
                      <Button size="sm" variant="ghost" icon={RefreshCw} disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("장면 다시 쓰기", () => studioApi.generate(p.id, "scene-rewrite", { sceneId: s.id, note: notes[s.id] ?? "" }))}>
                        이 장면 다시 쓰기
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Button size="sm" variant="secondary" icon={Plus} className="mt-3" disabled={sc.scenes.length >= MAX_SCENES} onClick={() => set({ scenes: [...sc.scenes, emptyScene({ title: `장면 ${sc.scenes.length + 1}` })] })}>
              맨 끝에 장면 추가
            </Button>
          </SectionCard>
        </>
      )}

      {p.scenarioVersions.length > 0 && (
        <SectionCard title="저장한 버전" icon={History} flush>
          <ul className="divide-y divide-line text-[13px]" data-scenario-versions>
            {[...p.scenarioVersions].reverse().map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2">
                <span className="font-medium text-fg">{v.label}</span>
                <span className="text-fg-subtle">
                  장면 {v.scenario.scenes.length}개 · {formatRelative(v.at)}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto" disabled={Boolean(ctl.busy)} onClick={() => window.confirm("이 버전으로 되돌릴까요? (지금 내용은 버전 저장을 먼저 해 두세요)") && void ctl.run("버전 되돌리기", () => studioApi.generate(p.id, "restore-version", { versionId: v.id }))}>
                  이 버전으로
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
