"use client";

import { BookOpen, Sparkles } from "lucide-react";
import { Button, EmptyState, SectionCard } from "@/components/ui";
import type { DramaStory } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { studioApi } from "../api";
import { TextField } from "../ui";
import type { ProjectCtl } from "../useProject";

const FIELDS: { k: keyof DramaStory; label: string }[] = [
  { k: "theme", label: "핵심 주제" },
  { k: "goal", label: "주인공의 목표" },
  { k: "lack", label: "주인공의 결핍" },
  { k: "conflict", label: "핵심 갈등" },
  { k: "twist", label: "이야기의 반전" },
  { k: "ending", label: "결말 방향" },
  { k: "message", label: "감정적 메시지" },
  { k: "hookStrategy", label: "시작 3초 후킹 전략" },
];

/** 03 로그라인·주제: AI 초안 → 로그라인 3개 중 고르거나 직접 → 승인한 내용을 이후 단계에서 계속 쓴다 */
export function StoryStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const s = p.story;
  const set = (patch: Partial<DramaStory>) => ctl.edit("story", { ...s, ...patch });
  const gen = () => void ctl.run("로그라인 생성", () => studioApi.generate(p.id, "story"));
  if (!s.loglines.length && !s.theme)
    return (
      <SectionCard>
        <EmptyState icon={BookOpen} title="로그라인·주제를 만들어 주세요" description={`'${p.selection.idea?.title ?? "선택한 아이디어"}'로 가제·로그라인 3가지·주제·갈등·반전·결말을 씁니다.`} action={<Button variant="primary" icon={Sparkles} loading={ctl.busy === "로그라인 생성"} onClick={gen} data-gen-story>AI 로 만들기 (1회)</Button>} className="py-16" />
      </SectionCard>
    );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="가제·로그라인" icon={BookOpen} actions={<Button size="sm" variant="ghost" icon={Sparkles} disabled={Boolean(ctl.busy)} onClick={gen}>다시 생성</Button>}>
        <div className="space-y-3" data-loglines>
          <TextField label="작품 가제" value={s.workingTitle} onChange={(v) => set({ workingTitle: v })} />
          {s.loglines.map((l, i) => (
            <div key={i} className={cn("rounded-control border p-2.5", s.loglineIndex === i ? "border-brand bg-brand-soft/40" : "border-line")}>
              <label className="mb-1 flex items-center gap-2 text-[12px] font-medium text-fg-muted">
                <input type="radio" name="logline" checked={s.loglineIndex === i} onChange={() => set({ loglineIndex: i })} className="accent-[var(--color-brand)]" />
                로그라인 {i + 1}
              </label>
              <TextField label="" rows={2} value={l} onChange={(v) => set({ loglines: s.loglines.map((x, j) => (j === i ? v : x)) })} />
            </div>
          ))}
          <div className={cn("rounded-control border p-2.5", s.loglineIndex === -1 ? "border-brand bg-brand-soft/40" : "border-line")}>
            <label className="mb-1 flex items-center gap-2 text-[12px] font-medium text-fg-muted">
              <input type="radio" name="logline" checked={s.loglineIndex === -1} onChange={() => set({ loglineIndex: -1 })} className="accent-[var(--color-brand)]" />
              직접 쓰기
            </label>
            <TextField label="" rows={2} value={s.customLogline} onChange={(v) => set({ customLogline: v, loglineIndex: -1 })} placeholder="새 로그라인" />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="주제·구조">
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <TextField key={f.k} label={f.label} rows={2} value={String(s[f.k] ?? "")} onChange={(v) => set({ [f.k]: v })} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
