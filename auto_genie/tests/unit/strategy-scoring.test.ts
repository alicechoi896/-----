import { describe, expect, it } from "vitest";
import {
  computeBaseScore,
  computePreferenceScore,
  computeEvidenceScore,
  computeFinalScore,
  applySelectionLearning,
  applyPerformanceLearning,
  WEIGHT_MIN,
  WEIGHT_MAX,
  LEARNING_RATE,
} from "@/lib/strategy/scoring";

const neutralWeights = {
  clarity_weight: 1,
  authority_weight: 1,
  purchase_link_weight: 1,
  brand_fit_weight: 1,
  novelty_weight: 1,
  empathy_weight: 1,
};

describe("computeBaseScore", () => {
  it("averages the six feature scores", () => {
    const score = computeBaseScore({
      clarity: 80,
      authority: 60,
      purchaseLink: 40,
      brandFit: 100,
      novelty: 20,
      empathy: 60,
    });
    expect(score).toBe(60);
  });
});

describe("computePreferenceScore", () => {
  it("equals the base average when all weights are neutral (1.0)", () => {
    const scores = { clarity: 80, authority: 60, purchaseLink: 40, brandFit: 100, novelty: 20, empathy: 60 };
    expect(computePreferenceScore(scores, neutralWeights)).toBeCloseTo(computeBaseScore(scores), 5);
  });

  it("weights a boosted dimension more heavily", () => {
    const scores = { clarity: 100, authority: 0, purchaseLink: 0, brandFit: 0, novelty: 0, empathy: 0 };
    const boosted = { ...neutralWeights, clarity_weight: 1.5 };
    const result = computePreferenceScore(scores, boosted);
    // clarity=100 with weight 1.5, others=0 with weight 1 -> 150 / 6.5
    expect(result).toBeCloseTo(150 / 6.5, 5);
  });
});

describe("computeEvidenceScore", () => {
  it("scores 0 with no sources, no similarity, no matched rules", () => {
    expect(computeEvidenceScore({ sourceCount: 0, avgSimilarity: 0, matchedRuleCount: 0, conflictCount: 0 })).toBe(0);
  });

  it("scores near 100 with strong evidence and no conflicts", () => {
    const score = computeEvidenceScore({ sourceCount: 5, avgSimilarity: 1, matchedRuleCount: 3, conflictCount: 0 });
    expect(score).toBe(100);
  });

  it("penalizes conflicts and never goes below 0", () => {
    const score = computeEvidenceScore({ sourceCount: 5, avgSimilarity: 1, matchedRuleCount: 3, conflictCount: 10 });
    expect(score).toBe(0);
  });
});

describe("computeFinalScore", () => {
  it("applies the 50/25/25 weighting", () => {
    const result = computeFinalScore({ baseScore: 80, preferenceScore: 60, evidenceScore: 40 });
    // 80*0.5 + 60*0.25 + 40*0.25 = 40 + 15 + 10 = 65
    expect(result).toBe(65);
  });

  it("clamps to the 0-100 range", () => {
    expect(computeFinalScore({ baseScore: 1000, preferenceScore: 0, evidenceScore: 0 })).toBe(100);
  });
});

describe("applySelectionLearning", () => {
  it("nudges only the weight(s) matching the stated reasons, by the learning rate", () => {
    const { updated, changes } = applySelectionLearning(neutralWeights, ["브랜드와 잘 맞음"]);
    expect(updated.brand_fit_weight).toBeCloseTo(1 + LEARNING_RATE, 5);
    expect(updated.clarity_weight).toBe(1);
    expect(changes).toHaveLength(1);
    expect(changes[0].key).toBe("brand_fit_weight");
  });

  it("ignores unmapped reasons like free-text custom input", () => {
    const { changes } = applySelectionLearning(neutralWeights, ["직접 입력"]);
    expect(changes).toHaveLength(0);
  });

  it("never exceeds WEIGHT_MAX even after repeated learning", () => {
    let weights = { ...neutralWeights, novelty_weight: WEIGHT_MAX - 0.01 };
    const result = applySelectionLearning(weights, ["새로움"]);
    weights = result.updated;
    expect(weights.novelty_weight).toBeLessThanOrEqual(WEIGHT_MAX);
  });
});

describe("applyPerformanceLearning", () => {
  it("moves a weight up by at most 0.05 on positive performance", () => {
    const { updated, change } = applyPerformanceLearning(neutralWeights, "empathy_weight", 1);
    expect(updated.empathy_weight).toBeCloseTo(1.05, 5);
    expect(change.after - change.before).toBeCloseTo(0.05, 5);
  });

  it("moves a weight down on negative performance and respects WEIGHT_MIN", () => {
    const { updated } = applyPerformanceLearning({ ...neutralWeights, empathy_weight: WEIGHT_MIN + 0.01 }, "empathy_weight", -1);
    expect(updated.empathy_weight).toBeGreaterThanOrEqual(WEIGHT_MIN);
  });
});
