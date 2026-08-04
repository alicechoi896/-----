import type { Database } from "@/types/database";

export interface FeatureScores {
  clarity: number;
  authority: number;
  purchaseLink: number;
  brandFit: number;
  novelty: number;
  empathy: number;
}

export type PreferenceWeights = Pick<
  Database["public"]["Tables"]["preference_weights"]["Row"],
  | "clarity_weight"
  | "authority_weight"
  | "purchase_link_weight"
  | "brand_fit_weight"
  | "novelty_weight"
  | "empathy_weight"
>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** AI 기본 적합도 (50% weight): the plain average of the six 0-100 feature scores. */
export function computeBaseScore(scores: FeatureScores): number {
  const values = [scores.clarity, scores.authority, scores.purchaseLink, scores.brandFit, scores.novelty, scores.empathy];
  return clamp(values.reduce((a, b) => a + b, 0) / values.length, 0, 100);
}

/** 기업 선호 가중치 반영 (25% weight): feature scores reweighted by the org's learned preference weights (0.5-1.5 each). */
export function computePreferenceScore(scores: FeatureScores, weights: PreferenceWeights): number {
  const pairs: [number, number][] = [
    [scores.clarity, weights.clarity_weight],
    [scores.authority, weights.authority_weight],
    [scores.purchaseLink, weights.purchase_link_weight],
    [scores.brandFit, weights.brand_fit_weight],
    [scores.novelty, weights.novelty_weight],
    [scores.empathy, weights.empathy_weight],
  ];
  const weightedSum = pairs.reduce((sum, [score, weight]) => sum + score * weight, 0);
  const weightSum = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return clamp(weightSum > 0 ? weightedSum / weightSum : 0, 0, 100);
}

export interface EvidenceScoreInput {
  /** distinct retrieved chunks this strategy actually cites */
  sourceCount: number;
  /** average cosine similarity (0-1) of the cited chunks to the campaign query */
  avgSimilarity: number;
  /** active decision_rules the AI reported applying, confirmed to exist */
  matchedRuleCount: number;
  /** hits against brand_profiles.prohibited_expressions or contradicting rules */
  conflictCount: number;
}

/** 데이터 근거 신뢰도 (25% weight): source count + retrieval similarity + rule consistency, penalized by conflicts. */
export function computeEvidenceScore(input: EvidenceScoreInput): number {
  const sourceComponent = clamp(input.sourceCount / 5, 0, 1) * 100;
  const similarityComponent = clamp(input.avgSimilarity, 0, 1) * 100;
  const ruleComponent = clamp(input.matchedRuleCount / 3, 0, 1) * 100;
  const weighted = 0.4 * sourceComponent + 0.3 * similarityComponent + 0.3 * ruleComponent;
  const conflictPenalty = Math.min(input.conflictCount * 15, 100);
  return clamp(weighted - conflictPenalty, 0, 100);
}

export interface ScoreBreakdown {
  baseScore: number;
  preferenceScore: number;
  evidenceScore: number;
}

/** finalScore = baseScore*0.50 + preferenceScore*0.25 + evidenceScore*0.25, computed server-side only. */
export function computeFinalScore({ baseScore, preferenceScore, evidenceScore }: ScoreBreakdown): number {
  const raw = baseScore * 0.5 + preferenceScore * 0.25 + evidenceScore * 0.25;
  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Preference weight learning (선호 학습) — not deep learning, a small linear
// nudge toward whatever dimension the user says drove their strategy choice.
// ---------------------------------------------------------------------------

export const SELECTION_REASON_TO_WEIGHT_KEY: Record<string, keyof PreferenceWeights> = {
  "고객 문제를 잘 짚음": "empathy_weight",
  "브랜드와 잘 맞음": "brand_fit_weight",
  "상품 연결성이 높음": "purchase_link_weight",
  "실행하기 쉬움": "clarity_weight",
  "새로움": "novelty_weight",
  "신뢰 형성에 유리함": "authority_weight",
};

/** Maps a strategy's dominant feature-score dimension directly onto its matching preference weight key. */
export const FEATURE_TO_WEIGHT_KEY: Record<keyof FeatureScores, keyof PreferenceWeights> = {
  clarity: "clarity_weight",
  authority: "authority_weight",
  purchaseLink: "purchase_link_weight",
  brandFit: "brand_fit_weight",
  novelty: "novelty_weight",
  empathy: "empathy_weight",
};

export const LEARNING_RATE = 0.05;
export const WEIGHT_MIN = 0.5;
export const WEIGHT_MAX = 1.5;

export interface WeightChange {
  key: keyof PreferenceWeights;
  before: number;
  after: number;
}

/** Nudges the weight(s) matching the user's stated selection reasons by ±LEARNING_RATE, clamped to [0.5, 1.5]. */
export function applySelectionLearning(
  current: PreferenceWeights,
  reasons: string[]
): { updated: PreferenceWeights; changes: WeightChange[] } {
  const updated: PreferenceWeights = { ...current };
  const changes: WeightChange[] = [];

  const keys = new Set(
    reasons.map((r) => SELECTION_REASON_TO_WEIGHT_KEY[r]).filter((k): k is keyof PreferenceWeights => Boolean(k))
  );

  for (const key of keys) {
    const before = current[key];
    const after = clamp(before + LEARNING_RATE, WEIGHT_MIN, WEIGHT_MAX);
    updated[key] = after;
    if (after !== before) changes.push({ key, before, after });
  }

  return { updated, changes };
}

/** Bounded weight adjustment driven by measured performance (±0.05 max per call), used by the performance feedback loop. */
export function applyPerformanceLearning(
  current: PreferenceWeights,
  key: keyof PreferenceWeights,
  direction: 1 | -1
): { updated: PreferenceWeights; change: WeightChange } {
  const before = current[key];
  const after = clamp(before + direction * 0.05, WEIGHT_MIN, WEIGHT_MAX);
  return { updated: { ...current, [key]: after }, change: { key, before, after } };
}
