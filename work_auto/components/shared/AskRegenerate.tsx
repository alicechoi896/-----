"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, Input } from "@/components/ui";

/**
 * v0.9.157 요청하며 만들기: 아무리 해도 원하는 제목·Hook·CTA·대본·섬네일이 안 나올 때 한 줄 요청을 붙여 다시 만든다 (누를 때 AI 1번).
 * 결과가 마음에 들면 [이 요청을 포맷 규칙으로 저장] → 그 원고의 대본 포맷 가이드라인 '사용자 요청 규칙'에 들어가 다음부터 늘 적용
 */
const CHIPS = ["더 짧게", "더 자극적으로", "대본 포맷 그대로", "숫자 넣기", "질문형으로", "사용 장면으로", "평점·후기 얘기 빼고"];

export function AskRegenerate({ contentId, label, onRun, canSaveRule = true }: { contentId: string; label: string; onRun: (request: string) => Promise<void>; canSaveRule?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  async function run() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setNote(null);
    try {
      await onRun(t);
      setDone(t);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function saveRule() {
    if (!done) return;
    try {
      const r = await api.contents.saveFormatRule(contentId, done);
      setNote(r.added ? `'${r.formatName}' 포맷 규칙에 저장했습니다. 다음 원고부터 늘 적용됩니다.` : `'${r.formatName}' 포맷에 이미 있는 규칙입니다.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "저장하지 못했습니다.");
    }
  }
  if (!open)
    return (
      <Button size="sm" variant="ghost" icon={MessageSquarePlus} onClick={() => setOpen(true)} title="한 줄 요청을 붙여 다시 만듭니다 (예: 더 짧게, 질문형으로)" data-ask-open>
        요청하며 만들기
      </Button>
    );
  return (
    <div className="w-full basis-full space-y-1.5 rounded-control border border-brand-line bg-brand-soft/30 p-2" data-ask-box>
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => setText((t) => (t ? `${t}, ${c}` : c))} className="rounded-full border border-line bg-canvas px-2 py-0.5 text-[11.5px] text-fg-muted hover:border-brand-line hover:text-brand">
            {c}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input value={text} onChange={(e) => setText(e.target.value.slice(0, 300))} onKeyDown={(e) => e.key === "Enter" && void run()} placeholder={`${label}: 원하는 방향을 한 줄로 (예: 30대 자취생에게 말하듯)`} className="h-8 text-[12.5px]" aria-label={`${label} 요청`} />
        <Button size="sm" variant="primary" loading={busy} disabled={!text.trim()} onClick={() => void run()} data-ask-run>
          이 요청으로
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
      {done && canSaveRule && (
        <button type="button" onClick={() => void saveRule()} className="text-[11.5px] text-brand hover:underline" data-ask-save-rule>
          이 요청을 포맷 규칙으로 저장 (‘{done.slice(0, 30)}’)
        </button>
      )}
      {note && <p className="text-[11.5px] text-fg-muted">{note}</p>}
    </div>
  );
}
