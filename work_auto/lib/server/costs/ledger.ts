import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * 비용 기록 (v0.9.149) — 유료 호출마다 한 줄을 DB(public.cost_events)에 남긴다. 비용 대시보드가 이걸 모아 보여 준다.
 * 기록에 실패해도(표가 아직 없음 등) 원래 작업은 그대로 진행한다. 금액은 공개 단가로 계산한 추정치.
 */
export type CostKind = "ai" | "tts" | "kie" | "tikhub";

export interface CostEntry {
  kind: CostKind;
  provider: string;
  model?: string;
  /** 쓴 양 (토큰·글자·크레딧·회) */
  units: number;
  unit: "tokens" | "chars" | "credits" | "calls";
  usd: number;
  note?: string;
  /** 같은 일을 두 번 세지 않게 (예: kie_{taskId}) */
  dedupeId?: string;
}

/** Claude 단가 (100만 토큰당 USD, 입력/출력 — 2026-10 공식 표) · OpenAI 는 추정 */
const AI_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /fable-5|mythos/, input: 10, output: 50 },
  { match: /opus-5-5/, input: 4, output: 20 },
  { match: /opus/, input: 5, output: 25 },
  { match: /sonnet-5/, input: 2, output: 10 },
  { match: /sonnet/, input: 3, output: 15 },
  { match: /haiku-5/, input: 0.1, output: 0.5 },
  { match: /haiku/, input: 1, output: 5 },
  // OpenAI (추정 — 모델에 따라 다름)
  { match: /mini/, input: 0.4, output: 1.6 },
  { match: /gpt|o\d/, input: 2, output: 8 },
];
export function aiUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = AI_PRICES.find((x) => x.match.test(model)) ?? { input: 3, output: 15 };
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
/** Kie 1 크레딧 ≈ $0.005 */
export const KIE_CREDIT_USD = 0.005;
/** 음성: OpenAI gpt-4o-mini-tts ≈ 글자 100만 개당 $15 (추정), 타입캐스트 ≈ 1글자 1크레딧 (요금제에 따라 다름 — 글자 수만 기록) */
export const TTS_USD_PER_CHAR: Record<string, number> = { "openai-tts": 15 / 1_000_000, typecast: 0 };

const seen = new Set<string>();

export async function recordCost(e: CostEntry): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (e.dedupeId) {
    if (seen.has(e.dedupeId)) return;
    seen.add(e.dedupeId);
    if (seen.size > 5000) seen.clear();
  }
  try {
    const db = await createSupabaseServerClient();
    const id = e.dedupeId ?? `ce_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await db.from("cost_events").insert({ id, kind: e.kind, provider: e.provider, model: e.model ?? null, units: e.units, unit: e.unit, usd: Number(e.usd.toFixed(6)), note: e.note?.slice(0, 120) ?? null });
  } catch {
    /* 기록 실패는 무시 (표가 없거나 권한 문제) */
  }
}

/** 기다리지 않고 기록 (요청 속도에 영향 없게) */
export function recordCostLater(e: CostEntry): void {
  void recordCost(e).catch(() => undefined);
}
