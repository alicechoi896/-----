"use client";

import { useEffect, useState } from "react";
import { Button, ErrorState, Input, LoadingState, Notice, SectionCard } from "@/components/ui";

/**
 * 비용 대시보드 (v0.9.149) — AI 글·음성·Kie(영상·이미지·음악)·TikHub 비용을 하루·이번 달·30일로.
 * 금액은 공개 단가로 계산한 추정치 (실제 청구는 각 업체 콘솔 기준). 월 예산을 정하면 80% 넘을 때 경고.
 */
type Kind = "ai" | "tts" | "kie" | "tikhub";
interface Summary {
  ready: boolean;
  days: { date: string; usd: number; byKind: Partial<Record<Kind, number>> }[];
  today: number;
  month: number;
  last30: number;
  byKind: Record<Kind, { usd: number; units: number }>;
  topModels: { model: string; kind: Kind; usd: number; count: number }[];
  typecastChars: number;
  budget: { monthUsd: number | null };
}
const LABEL: Record<Kind, string> = { ai: "AI 글 (Claude·OpenAI)", tts: "AI 음성", kie: "Kie (영상·이미지·음악)", tikhub: "TikHub" };
const COLOR: Record<Kind, string> = { ai: "bg-brand", tts: "bg-success", kie: "bg-warning", tikhub: "bg-danger" };
const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "불러오지 못했습니다.");
  return j.data;
}

export function CostDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const s = await call<Summary>("/api/admin/costs");
      setData(s);
      setBudget(s.budget.monthUsd ? String(s.budget.monthUsd) : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }
  useEffect(() => {
    void (async () => load())();
  }, []);
  async function saveBudget() {
    setSaving(true);
    try {
      await call("/api/admin/costs", { method: "PUT", body: JSON.stringify({ monthUsd: Number(budget) || null }) });
      await load();
    } finally {
      setSaving(false);
    }
  }
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <LoadingState label="비용을 모으는 중…" />;
  const max = Math.max(0.0001, ...data.days.map((d) => d.usd));
  const pct = data.budget.monthUsd ? data.month / data.budget.monthUsd : 0;
  return (
    <div className="space-y-5" data-cost-dashboard>
      {!data.ready && <Notice tone="warning">비용 기록 표(cost_events)가 아직 없습니다. 안내드린 SQL 을 Supabase 에서 실행하면 그때부터 기록됩니다.</Notice>}
      {data.budget.monthUsd && pct >= 0.8 && (
        <Notice tone="warning">
          이번 달 비용이 예산의 {Math.round(pct * 100)}% 입니다 ({usd(data.month)} / {usd(data.budget.monthUsd)}).
        </Notice>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["오늘", data.today],
          ["이번 달", data.month],
          ["최근 30일", data.last30],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-card border border-line bg-canvas p-4 shadow-card">
            <p className="text-[12px] text-fg-subtle">{l}</p>
            <p className="tabular mt-1 text-2xl font-bold">{usd(Number(v))}</p>
          </div>
        ))}
      </div>
      <SectionCard title="최근 30일 (하루 비용)" description="막대 색: AI 글 · 음성 · Kie · TikHub. 금액은 공개 단가로 계산한 추정치입니다.">
        <div className="flex h-40 items-end gap-[3px]" data-cost-chart>
          {data.days.map((d) => (
            <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${d.date} · ${usd(d.usd)}`}>
              {(Object.keys(LABEL) as Kind[]).map((k) =>
                d.byKind[k] ? <div key={k} className={COLOR[k]} style={{ height: `${((d.byKind[k] ?? 0) / max) * 100}%` }} /> : null,
              )}
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-fg-subtle">
          <span>{data.days[0]?.date.slice(5)}</span>
          <span>{data.days[data.days.length - 1]?.date.slice(5)}</span>
        </div>
      </SectionCard>
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="종류별 (30일)">
          <ul className="space-y-2 text-[13px]">
            {(Object.keys(LABEL) as Kind[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className={`size-3 rounded-sm ${COLOR[k]}`} />
                <span className="flex-1">{LABEL[k]}</span>
                <span className="tabular font-semibold">{usd(data.byKind[k]?.usd ?? 0)}</span>
              </li>
            ))}
            {data.typecastChars > 0 && <li className="text-[12px] text-fg-subtle">타입캐스트 음성 {data.typecastChars.toLocaleString()}글자 (≈ 크레딧, 요금제에 따라 금액이 달라 금액에는 넣지 않음)</li>}
          </ul>
        </SectionCard>
        <SectionCard title="많이 쓴 모델·서비스 (30일)">
          <ul className="space-y-1.5 text-[12.5px]">
            {data.topModels.length === 0 && <li className="text-fg-subtle">아직 기록이 없습니다.</li>}
            {data.topModels.map((m) => (
              <li key={m.kind + m.model} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-sm ${COLOR[m.kind]}`} />
                <span className="min-w-0 flex-1 truncate">{m.model}</span>
                <span className="text-fg-subtle">{m.count.toLocaleString()}회</span>
                <span className="tabular w-16 text-right font-semibold">{usd(m.usd)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
      <SectionCard title="월 예산" description="정해 두면 이번 달 비용이 예산의 80% 를 넘을 때 이 화면 위쪽에 경고가 나옵니다.">
        <div className="flex items-center gap-2">
          $<Input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} className="h-9 w-32" aria-label="월 예산 (USD)" placeholder="예: 100" />
          <Button size="sm" variant="primary" loading={saving} onClick={() => void saveBudget()} data-cost-budget-save>
            저장
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
