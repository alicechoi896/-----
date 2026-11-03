"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select } from "@/components/ui";
import { cn, formatRelative } from "@/lib/utils";

/**
 * v0.9.164 피드백 학습 — 결과 화면의 👍·👎 기록, 승인한 규칙(켜고 끄기·고치기·지우기)과 효과, 자주 나오는 불만 묶기(AI 1번)
 */
type Key = "titles" | "hooks" | "ctas" | "script" | "thumbnailTitles";
const LABEL: Record<Key, string> = { titles: "제목", hooks: "Hook", ctas: "CTA", script: "대본", thumbnailTitles: "섬네일 제목" };
interface Item {
  id: string;
  key: Key;
  item: string;
  vote: "up" | "down";
  reasons: string[];
  note: string;
  why?: string;
  fixes?: string[];
  rule?: string;
  ruleId?: string | null;
  at: string;
}
interface Rule {
  id: string;
  key: Key;
  text: string;
  on: boolean;
  at: string;
}
interface Data {
  items: Item[];
  rules: Rule[];
  effect: { ruleId: string; before: number | null; after: number | null; afterN: number }[];
}

async function call<T>(body?: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/feedback-learning", { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

export function FeedbackLearningTab() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sugs, setSugs] = useState<{ key: Key; text: string; count: number }[] | null>(null);
  const [newKey, setNewKey] = useState<Key>("titles");
  const [newText, setNewText] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await call<Data>());
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    void (async () => load())();
  }, [load]);
  const act = async (body: Record<string, unknown>) => {
    try {
      await call(body);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "하지 못했습니다.");
    }
  };
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="피드백을 불러오는 중…" />;
  const effectOf = (id: string) => data.effect.find((e) => e.ruleId === id);
  const downs = data.items.filter((i) => i.vote === "down").length;
  return (
    <div className="space-y-5" data-feedback-learning>
      <Notice tone="info">결과 화면(영상 원고·클립 원고·자동 제작)의 제목·Hook·CTA·대본·섬네일 제목 옆 <b>[왜?] 👍 👎</b>로 남긴 기록입니다. 👎 의 [고치고 배우기]에서 승인한 규칙은 다음 생성부터 그 항목을 만들 때 꼭 지키는 지시로 들어갑니다 (대본 포맷·정직성 규칙이 더 우선).</Notice>
      {msg && <Notice tone="warning">{msg}</Notice>}
      <SectionCard
        title={`배운 규칙 · 켜짐 ${data.rules.filter((r) => r.on).length}개`}
        description="항목마다 켜진 규칙은 최대 10개입니다 (넘으면 오래된 것이 꺼짐). 효과 = 규칙을 만든 뒤 그 항목의 👎 비율 변화."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={Sparkles}
            loading={busy}
            disabled={downs < 3}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setMsg(null);
                try {
                  setSugs((await call<{ suggestions: { key: Key; text: string; count: number }[] }>({ action: "cluster" })).suggestions);
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "묶지 못했습니다.");
                } finally {
                  setBusy(false);
                }
              })()
            }
            data-cluster
          >
            자주 나오는 불만 묶기 (AI 1번)
          </Button>
        }
        data-rules
      >
        {sugs && (
          <div className="mb-3 space-y-1 rounded-control border border-brand-line bg-brand-soft/30 p-2 text-[12.5px]">
            <p className="font-semibold">규칙 후보 {sugs.length}개</p>
            {sugs.length === 0 && <p className="text-fg-muted">반복되는 불만이 아직 없습니다.</p>}
            {sugs.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge tone="neutral">{LABEL[x.key]}</Badge>
                <span className="flex-1">{x.text}</span>
                <span className="text-[11px] text-fg-subtle">{x.count}번</span>
                <Button size="sm" variant="ghost" onClick={() => void act({ action: "learn", key: x.key, text: x.text }).then(() => setSugs((l) => (l ?? []).filter((_, j) => j !== i)))}>
                  배우기
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select className="w-32" value={newKey} onChange={(e) => setNewKey(e.target.value as Key)} options={(Object.keys(LABEL) as Key[]).map((k) => ({ value: k, label: LABEL[k] }))} aria-label="항목" />
          <Input value={newText} onChange={(e) => setNewText(e.target.value.slice(0, 200))} placeholder="직접 규칙 적기 (예: 제목 첫 단어에 제품명을 넣지 않는다)" className="h-9 min-w-0 flex-1" aria-label="새 규칙" />
          <Button size="sm" variant="primary" disabled={!newText.trim()} onClick={() => void act({ action: "learn", key: newKey, text: newText }).then(() => setNewText(""))}>
            추가
          </Button>
        </div>
        {data.rules.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">아직 배운 규칙이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.rules.map((r) => {
              const e = effectOf(r.id);
              return (
                <li key={r.id} className={cn("flex flex-wrap items-center gap-2 py-2 text-[13px]", !r.on && "opacity-60")} data-rule>
                  <input type="checkbox" checked={r.on} onChange={(x) => void act({ action: "rule", id: r.id, on: x.target.checked })} className="accent-[var(--color-brand)]" aria-label="켜기" />
                  <Badge tone="neutral">{LABEL[r.key]}</Badge>
                  <Input key={r.text} defaultValue={r.text} onBlur={(x) => x.target.value !== r.text && void act({ action: "rule", id: r.id, text: x.target.value })} className="h-8 min-w-0 flex-1 text-[13px]" aria-label="규칙" />
                  <span className="text-[11px] text-fg-subtle" title="규칙 만든 뒤 그 항목의 별로예요 비율">
                    {e && e.before != null ? `👎 ${e.before}% → ${e.after ?? "-"}%${e.afterN ? ` (${e.afterN}건)` : ""}` : formatRelative(r.at)}
                  </span>
                  <button type="button" onClick={() => window.confirm("이 규칙을 지울까요?") && void act({ action: "rule", id: r.id, remove: true })} className="text-fg-subtle hover:text-danger" aria-label="지우기">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      <SectionCard title={`받은 피드백 · ${data.items.length}개`} description="최근 순. 👎 는 AI 가 분석한 이유와 고친 후보, 규칙 제안을 함께 보여 줍니다." data-feedback-items>
        {data.items.length === 0 ? (
          <EmptyState icon={ThumbsDown} title="아직 피드백이 없습니다" description="결과 화면에서 후보 옆 👍·👎 를 눌러 주세요." compact />
        ) : (
          <ul className="space-y-2" data-feedback-list>
            {data.items.slice(0, 80).map((i) => (
              <li key={i.id} className="rounded-control border border-line p-2.5 text-[12.5px]">
                <div className="flex items-start gap-2">
                  {i.vote === "up" ? <ThumbsUp className="mt-0.5 size-4 text-success" /> : <ThumbsDown className="mt-0.5 size-4 text-danger" />}
                  <Badge tone="neutral">{LABEL[i.key]}</Badge>
                  <span className="min-w-0 flex-1 whitespace-pre-line">{i.item.slice(0, 300)}</span>
                  <span className="text-[11px] text-fg-subtle">{formatRelative(i.at)}</span>
                  <button type="button" onClick={() => void act({ action: "removeItem", id: i.id })} className="text-fg-subtle hover:text-danger" aria-label="기록 지우기">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {i.vote === "down" && (
                  <div className="mt-1.5 space-y-0.5 pl-6 text-fg-muted">
                    {(i.reasons.length > 0 || i.note) && <p>이유: {[...i.reasons, i.note].filter(Boolean).join(", ")}</p>}
                    {i.why && <p>왜 그렇게 나왔나: {i.why}</p>}
                    {(i.fixes ?? []).length > 0 && <p>고친 후보: {(i.fixes ?? []).map((f) => f.split("\n")[0]).join(" / ")}</p>}
                    {i.rule && (
                      <p className="flex flex-wrap items-center gap-1.5">
                        규칙 제안: <b className="text-fg">{i.rule}</b>
                        {i.ruleId ? (
                          <span className="text-[11px] text-success">배움</span>
                        ) : (
                          <button type="button" onClick={() => void act({ action: "learn", feedbackId: i.id })} className="text-[11px] text-brand hover:underline">
                            이 규칙 배우기
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
