"use client";

import { useState } from "react";
import { Check, Copy, Pencil, RefreshCw, Sparkles, Star } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, SectionCard, Select } from "@/components/ui";
import { GENRES, MOODS, TARGET_SECONDS } from "@/lib/drama-studio/steps";
import type { DramaIdea, DramaSettings } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { studioApi } from "../api";
import { TextField } from "../ui";
import type { ProjectCtl } from "../useProject";

/** 01 아이디어: 입력 → AI 아이디어 20개 → 카드에서 선택·수정·개별 재생성·즐겨찾기·비슷한 아이디어 확장 */
export function IdeasStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const s = p.settings;
  const [editing, setEditing] = useState<string | null>(null);
  const set = (patch: Partial<DramaSettings>) => ctl.edit("settings", { ...s, ...patch });
  const setIdea = (id: string, patch: Partial<DramaIdea>) => ctl.edit("ideas", p.ideas.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const pick = (idea: DramaIdea) => ctl.edit("selection", { ...p.selection, ideaId: idea.id, idea: { ...idea } });
  return (
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <SectionCard title="아이디어 입력" icon={Sparkles}>
        <div className="space-y-3">
          <TextField label="아이디어 (자유 입력)" rows={4} value={s.idea} onChange={(v) => set({ idea: v })} placeholder="예: 헤어진 연인에게서 1년 만에 문자가 온다" />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">장르</span>
              <Select value={s.genre} options={GENRES.map((g) => ({ value: g, label: g }))} onChange={(e) => set({ genre: e.target.value })} aria-label="장르" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">분위기</span>
              <Select value={s.mood} options={MOODS.map((g) => ({ value: g, label: g }))} onChange={(e) => set({ mood: e.target.value })} aria-label="분위기" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">목표 길이</span>
              <Select value={String(s.targetSec)} options={TARGET_SECONDS.map((x) => ({ value: String(x), label: `${x}초` }))} onChange={(e) => set({ targetSec: Number(e.target.value) })} aria-label="목표 길이" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">화면 비율</span>
              <Select value={s.aspect} options={[{ value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" }]} onChange={(e) => set({ aspect: e.target.value as DramaSettings["aspect"] })} aria-label="화면 비율" />
            </label>
          </div>
          <TextField label="타깃 시청자 (선택)" value={s.audience} onChange={(v) => set({ audience: v })} placeholder="예: 20~30대 여성" />
          <TextField label="반드시 넣을 설정 (선택)" rows={2} value={s.mustHave} onChange={(v) => set({ mustHave: v })} />
          <Button variant="primary" icon={Sparkles} className="w-full" loading={ctl.busy === "아이디어 생성"} disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("아이디어 생성", () => studioApi.generate(p.id, "ideas"))} data-gen-ideas>
            {p.ideas.length ? "아이디어 20개 다시 생성" : "아이디어 20개 만들기"}
          </Button>
          <p className="text-[11.5px] text-fg-subtle">다시 생성하면 즐겨찾기(★)와 고른 아이디어는 남기고 나머지만 새로 만듭니다. AI 글 1회.</p>
        </div>
      </SectionCard>
      <div>
        {!p.ideas.length ? (
          <SectionCard>
            <EmptyState icon={Sparkles} title="아이디어가 아직 없습니다" description="왼쪽에 아이디어를 쓰고 [아이디어 20개 만들기]를 눌러 주세요." className="py-16" />
          </SectionCard>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" data-ideas>
            {p.ideas.map((idea, n) => {
              const chosen = p.selection.ideaId === idea.id;
              return (
                <li key={idea.id} className={cn("rounded-card border bg-canvas p-3.5", chosen ? "border-brand ring-1 ring-brand" : "border-line")} data-idea>
                  <div className="mb-1.5 flex items-start gap-2">
                    <span className="tabular text-[12px] text-fg-subtle">{n + 1}</span>
                    {editing === idea.id ? <TextField label="제목" value={idea.title} onChange={(v) => setIdea(idea.id, { title: v })} className="flex-1" /> : <p className="flex-1 text-[14px] font-semibold text-fg">{idea.title}</p>}
                    <IconButton icon={Star} label="즐겨찾기" onClick={() => setIdea(idea.id, { favorite: !idea.favorite })} className={idea.favorite ? "text-warning" : ""} />
                  </div>
                  {editing === idea.id ? (
                    <div className="space-y-2">
                      {(["concept", "conflict", "hook", "twist", "fit"] as const).map((k) => (
                        <TextField key={k} label={{ concept: "한 줄 콘셉트", conflict: "핵심 갈등", hook: "첫 3초 후킹", twist: "예상 반전", fit: "쇼츠 적합성" }[k]} rows={2} value={idea[k]} onChange={(v) => setIdea(idea.id, { [k]: v })} />
                      ))}
                    </div>
                  ) : (
                    <dl className="space-y-1 text-[12.5px] text-fg-muted">
                      <p className="text-fg">{idea.concept}</p>
                      <p>
                        <b className="font-medium text-fg">갈등</b> {idea.conflict}
                      </p>
                      <p>
                        <b className="font-medium text-fg">3초 후킹</b> {idea.hook}
                      </p>
                      <p>
                        <b className="font-medium text-fg">반전</b> {idea.twist}
                      </p>
                      <p className="text-fg-subtle">{idea.fit}</p>
                    </dl>
                  )}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant={chosen ? "primary" : "secondary"} icon={Check} onClick={() => pick(idea)} data-pick-idea>
                      {chosen ? "선택됨" : "선택"}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(editing === idea.id ? null : idea.id)}>
                      {editing === idea.id ? "완료" : "수정"}
                    </Button>
                    <Button size="sm" variant="ghost" icon={RefreshCw} disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("다시 생성", () => studioApi.generate(p.id, "idea-one", { ideaId: idea.id }))}>
                      다시 생성
                    </Button>
                    <Button size="sm" variant="ghost" icon={Copy} disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("비슷한 아이디어", () => studioApi.generate(p.id, "similar", { ideaId: idea.id }))}>
                      비슷한 5개
                    </Button>
                    {chosen && <Badge tone="brand">승인하면 02 선택으로</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
