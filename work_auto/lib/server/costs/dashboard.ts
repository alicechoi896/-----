import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { videoStorage } from "../video/storage";
import { getCurrentUserId } from "../repositories";
import type { CostKind } from "./ledger";

/**
 * 비용 대시보드 (v0.9.149) — cost_events 를 날짜·종류별로 모은다. 월 예산(관리자가 정함)과 비교해 경고.
 */
export interface CostSummary {
  ready: boolean;
  days: { date: string; usd: number; byKind: Partial<Record<CostKind, number>> }[];
  today: number;
  month: number;
  last30: number;
  byKind: Record<CostKind, { usd: number; units: number }>;
  topModels: { model: string; kind: CostKind; usd: number; count: number }[];
  typecastChars: number;
  budget: { monthUsd: number | null };
}

const kst = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const budgetKey = (owner: string) => `${owner}/costs/budget.json`;

export async function readBudget(): Promise<{ monthUsd: number | null }> {
  const owner = await getCurrentUserId();
  const buf = await videoStorage.download(budgetKey(owner)).catch(() => null);
  try {
    const j = buf ? (JSON.parse(buf.toString("utf8")) as { monthUsd?: number }) : {};
    return { monthUsd: Number.isFinite(Number(j.monthUsd)) && Number(j.monthUsd) > 0 ? Number(j.monthUsd) : null };
  } catch {
    return { monthUsd: null };
  }
}
export async function saveBudget(monthUsd: number | null): Promise<{ monthUsd: number | null }> {
  const owner = await getCurrentUserId();
  const v = monthUsd && monthUsd > 0 ? Math.min(100_000, Math.round(monthUsd * 100) / 100) : null;
  await videoStorage.put(budgetKey(owner), Buffer.from(JSON.stringify({ monthUsd: v })), "application/json", "0");
  return { monthUsd: v };
}

export async function costSummary(): Promise<CostSummary> {
  const empty: CostSummary = {
    ready: false,
    days: [],
    today: 0,
    month: 0,
    last30: 0,
    byKind: { ai: { usd: 0, units: 0 }, tts: { usd: 0, units: 0 }, kie: { usd: 0, units: 0 }, tikhub: { usd: 0, units: 0 } },
    topModels: [],
    typecastChars: 0,
    budget: await readBudget().catch(() => ({ monthUsd: null })),
  };
  if (!isSupabaseConfigured()) return { ...empty, ready: true };
  const db = await createSupabaseServerClient();
  const since = new Date(Date.now() - 40 * 86400_000).toISOString();
  const rows: { created_at: string; kind: CostKind; provider: string; model: string | null; units: number; unit: string; usd: number }[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await db.from("cost_events").select("created_at,kind,provider,model,units,unit,usd").gte("created_at", since).order("created_at", { ascending: false }).range(from, from + 999);
    if (error) return empty; // 표가 아직 없음
    rows.push(...((data ?? []) as typeof rows));
    if (!data || data.length < 1000) break;
  }
  const now = new Date();
  const today = kst(now);
  const monthPrefix = today.slice(0, 7);
  const cut30 = kst(new Date(now.getTime() - 29 * 86400_000));
  const byDay = new Map<string, { usd: number; byKind: Partial<Record<CostKind, number>> }>();
  const out = { ...empty, ready: true };
  const models = new Map<string, { model: string; kind: CostKind; usd: number; count: number }>();
  for (const r of rows) {
    const d = kst(new Date(r.created_at));
    const usd = Number(r.usd) || 0;
    if (d >= cut30) {
      const day = byDay.get(d) ?? { usd: 0, byKind: {} };
      day.usd += usd;
      day.byKind[r.kind] = (day.byKind[r.kind] ?? 0) + usd;
      byDay.set(d, day);
      out.last30 += usd;
      out.byKind[r.kind] = { usd: (out.byKind[r.kind]?.usd ?? 0) + usd, units: (out.byKind[r.kind]?.units ?? 0) + (Number(r.units) || 0) };
      const mk = `${r.kind}|${r.model || r.provider}`;
      const m = models.get(mk) ?? { model: r.model || r.provider, kind: r.kind, usd: 0, count: 0 };
      m.usd += usd;
      m.count++;
      models.set(mk, m);
      if (r.provider === "typecast") out.typecastChars += Number(r.units) || 0;
    }
    if (d === today) out.today += usd;
    if (d.startsWith(monthPrefix)) out.month += usd;
  }
  for (let i = 29; i >= 0; i--) {
    const d = kst(new Date(now.getTime() - i * 86400_000));
    const v = byDay.get(d);
    out.days.push({ date: d, usd: Number((v?.usd ?? 0).toFixed(4)), byKind: v?.byKind ?? {} });
  }
  out.topModels = [...models.values()].sort((a, b) => b.usd - a.usd).slice(0, 10);
  return out;
}
