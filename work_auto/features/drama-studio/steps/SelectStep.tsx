"use client";

import { useState } from "react";
import { Lightbulb, Wand2 } from "lucide-react";
import { Button, Notice, SectionCard } from "@/components/ui";
import { newId } from "@/lib/drama-studio/steps";
import type { DramaIdea } from "@/lib/drama-studio/types";
import { studioApi } from "../api";
import { TextField } from "../ui";
import type { ProjectCtl } from "../useProject";

const FIELDS: { k: keyof Omit<DramaIdea, "id" | "favorite">; label: string; rows: number }[] = [
  { k: "title", label: "제목", rows: 0 },
  { k: "concept", label: "한 줄 콘셉트", rows: 2 },
  { k: "conflict", label: "핵심 갈등", rows: 2 },
  { k: "hook", label: "첫 3초 후킹", rows: 2 },
  { k: "twist", label: "예상 반전", rows: 2 },
  { k: "fit", label: "쇼츠 적합성", rows: 2 },
];

/** 02 선택: 고른 아이디어를 고치거나 직접 쓰고, 메모·AI 개선 제안을 받아 확정 */
export function SelectStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const sel = p.selection;
  const [improved, setImproved] = useState<DramaIdea | null>(null);
  const idea: DramaIdea = sel.idea ?? { id: newId("id"), title: "", concept: "", conflict: "", hook: "", twist: "", fit: "", favorite: false };
  const setIdea = (patch: Partial<DramaIdea>) => ctl.edit("selection", { ...sel, idea: { ...idea, ...patch } });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <SectionCard title="제작할 아이디어" icon={Lightbulb} description={sel.ideaId ? "1단계에서 고른 아이디어입니다. 자유롭게 고치거나 직접 쓴 아이디어로 바꿀 수 있습니다." : "직접 쓴 아이디어로 시작합니다."}>
        <div className="space-y-3" data-selection>
          {FIELDS.map((f) => (
            <TextField key={f.k} label={f.label} rows={f.rows} value={String(idea[f.k] ?? "")} onChange={(v) => setIdea({ [f.k]: v })} />
          ))}
          <TextField label="선택 이유·추가 설정 메모" rows={3} value={sel.memo} onChange={(v) => ctl.edit("selection", { ...sel, idea, memo: v })} />
        </div>
      </SectionCard>
      <SectionCard title="AI 개선 제안" icon={Wand2}>
        <div className="space-y-3">
          <Button
            variant="secondary"
            icon={Wand2}
            className="w-full"
            disabled={Boolean(ctl.busy) || !idea.title}
            loading={ctl.busy === "개선 제안"}
            onClick={async () => {
              const r = await ctl.run("개선 제안", () => studioApi.generate(p.id, "improve"));
              if (r?.improved) setImproved(r.improved);
            }}
          >
            개선 제안 받기 (AI 1회)
          </Button>
          {sel.suggestions.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-muted" data-suggestions>
              {sel.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {improved && (
            <Notice tone="info" title="제안을 반영한 아이디어">
              <p className="font-medium">{improved.title}</p>
              <p className="text-[12.5px]">{improved.concept}</p>
              <Button size="sm" variant="subtle" className="mt-2" onClick={() => (ctl.edit("selection", { ...sel, idea: { ...improved, id: idea.id } }), setImproved(null))}>
                이 내용으로 바꾸기
              </Button>
            </Notice>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
