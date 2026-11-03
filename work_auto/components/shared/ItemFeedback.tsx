"use client";

import { useState } from "react";
import { HelpCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * v0.9.164 결과 항목 하나의 [왜?] [👍] [👎] — 제목·Hook·CTA·대본·섬네일 제목
 * 👎: 이유 고르기 → [고치고 배우기] (AI 1번) → 왜 그렇게 나왔는지 + 고친 후보 3개 [이걸로 쓰기] + 규칙 제안 [이 규칙 배우기]
 */
export type FeedbackKey = "titles" | "hooks" | "ctas" | "script" | "thumbnailTitles";
const REASONS = ["너무 길다", "과장됐다", "포맷이랑 다르다", "제품이랑 안 맞다", "뻔하다", "말투가 이상하다", "평점·후기 얘기", "궁금하지 않다"];

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/feedback-learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

interface Critique {
  id: string;
  why?: string;
  fixes?: string[];
  rule?: string;
}

export function ItemFeedback({ contentId, itemKey, item, why, formatRef, onUseFix, className }: { contentId: string; itemKey: FeedbackKey; item: string; why?: string | null; formatRef?: string | null; onUseFix?: (text: string) => void | Promise<void>; className?: string }) {
  const [open, setOpen] = useState<"why" | "down" | null>(null);
  const [voted, setVoted] = useState<"up" | "down" | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Critique | null>(null);
  const [learned, setLearned] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stop = (e: React.MouseEvent) => (e.preventDefault(), e.stopPropagation());

  async function up(e: React.MouseEvent) {
    stop(e);
    try {
      await call({ action: "up", contentId, key: itemKey, item });
      setVoted("up");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "저장하지 못했습니다.");
    }
  }
  async function critique() {
    setBusy(true);
    setErr(null);
    try {
      setRes(await call<Critique>({ action: "critique", contentId, key: itemKey, item, reasons, note }));
      setVoted("down");
    } catch (x) {
      setErr(x instanceof Error ? x.message : "분석하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function learn() {
    if (!res) return;
    try {
      await call({ action: "learn", feedbackId: res.id, text: res.rule });
      setLearned(true);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "저장하지 못했습니다.");
    }
  }
  const btn = "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-fg-subtle hover:bg-subtle hover:text-fg";
  return (
    <span className={cn("block", className)} data-item-feedback onClick={(e) => e.stopPropagation()}>
      <span className="inline-flex items-center gap-0.5">
        <button type="button" className={cn(btn, open === "why" && "text-brand")} onClick={(e) => (stop(e), setOpen(open === "why" ? null : "why"))} title="AI 가 왜 이렇게 썼는지" data-why>
          <HelpCircle className="size-3.5" />왜?
        </button>
        <button type="button" className={cn(btn, voted === "up" && "text-success")} onClick={(e) => void up(e)} title="좋아요 (기록)" aria-label="좋아요">
          <ThumbsUp className="size-3.5" />
        </button>
        <button type="button" className={cn(btn, (voted === "down" || open === "down") && "text-danger")} onClick={(e) => (stop(e), setOpen(open === "down" ? null : "down"))} title="별로예요 — 고치고 배우기" aria-label="별로예요" data-down>
          <ThumbsDown className="size-3.5" />
        </button>
      </span>
      {open === "why" && (
        <span className="mt-1 block rounded-control bg-subtle px-2 py-1.5 text-[11.5px] leading-relaxed text-fg-muted" data-why-box>
          {why ? <span className="block">노린 것: {why}</span> : <span className="block">이유 기록이 없습니다 (이 기능 전에 만든 결과이거나 [추가 만들기]로 더한 후보).</span>}
          {formatRef && <span className="block text-brand">포맷 따라 씀: {formatRef}</span>}
        </span>
      )}
      {open === "down" && (
        <span className="mt-1 block space-y-1.5 rounded-control border border-danger/30 bg-danger/5 p-2" data-down-box>
          <span className="flex flex-wrap gap-1">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={(e) => (stop(e), setReasons((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r])))} className={cn("rounded-full border px-2 py-0.5 text-[11px]", reasons.includes(r) ? "border-danger bg-danger/10 text-danger" : "border-line bg-canvas text-fg-muted")}>
                {r}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-1">
            <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} onClick={(e) => e.stopPropagation()} placeholder="직접 적기 (선택)" className="h-7 text-[12px]" aria-label="별로인 이유" />
            <Button size="sm" variant="primary" loading={busy} disabled={!reasons.length && !note.trim()} onClick={(e) => (stop(e), void critique())} data-critique>
              고치고 배우기
            </Button>
          </span>
          {res && (
            <span className="block space-y-1 text-[12px]" data-critique-result>
              {res.why && <span className="block text-fg-muted">왜 이렇게 나왔나: {res.why}</span>}
              {(res.fixes ?? []).map((f, i) => (
                <span key={i} className="flex items-start gap-1.5 rounded bg-canvas px-2 py-1">
                  <span className="flex-1 whitespace-pre-line text-fg">{f}</span>
                  {onUseFix && (
                    <button type="button" onClick={(e) => (stop(e), void onUseFix(f))} className="shrink-0 text-[11px] text-brand hover:underline">
                      이걸로 쓰기
                    </button>
                  )}
                </span>
              ))}
              {res.rule && (
                <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-fg-muted">앞으로: <b className="text-fg">{res.rule}</b></span>
                  {learned ? (
                    <span className="text-[11px] text-success">배웠습니다 — 다음 생성부터 적용</span>
                  ) : (
                    <button type="button" onClick={(e) => (stop(e), void learn())} className="text-[11px] text-brand hover:underline" data-learn>
                      이 규칙 배우기
                    </button>
                  )}
                </span>
              )}
            </span>
          )}
          {err && <span className="block text-[11.5px] text-danger">{err}</span>}
        </span>
      )}
    </span>
  );
}
