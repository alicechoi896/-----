import type { CampaignGoal } from "@/types/database";

export interface RawMetrics {
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  clicks: number;
  inquiries: number;
  consultations: number;
  purchases: number;
}

export interface PerformanceRatios {
  viewRate: number;
  engagementRate: number;
  saveRate: number;
  clickRate: number;
  inquiryConversionRate: number;
  purchaseConversionRate: number;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

/** All rates are 0-1 fractions; safe against division by zero. */
export function computeRatios(m: RawMetrics): PerformanceRatios {
  return {
    viewRate: safeDivide(m.views, m.impressions),
    engagementRate: safeDivide(m.likes + m.comments, m.views),
    saveRate: safeDivide(m.saves, m.views),
    clickRate: safeDivide(m.clicks, m.views),
    inquiryConversionRate: safeDivide(m.inquiries + m.consultations, m.views),
    purchaseConversionRate: safeDivide(m.purchases, m.views),
  };
}

// "Good" reference rates used only to normalize into a 0-100 scale — chosen
// from typical organic social/content benchmarks so one viral outlier can't
// blow the score past what a healthy rate already earns.
const BENCHMARKS = {
  engagementRate: 0.05,
  saveRate: 0.03,
  clickRate: 0.04,
  inquiryConversionRate: 0.02,
  purchaseConversionRate: 0.01,
};

function normalize(rate: number, benchmark: number): number {
  return Math.min(100, Math.max(0, (rate / benchmark) * 100));
}

/** 캠페인 목표별 가중치 프리셋 — each sums to 100. */
export const GOAL_WEIGHT_PRESETS: Record<
  CampaignGoal,
  { engagement: number; save: number; click: number; inquiry: number; purchase: number }
> = {
  awareness: { engagement: 25, save: 20, click: 20, inquiry: 15, purchase: 20 },
  views: { engagement: 30, save: 20, click: 25, inquiry: 15, purchase: 10 },
  saves: { engagement: 20, save: 35, click: 20, inquiry: 15, purchase: 10 },
  inquiries: { engagement: 15, save: 15, click: 20, inquiry: 30, purchase: 20 },
  consultations: { engagement: 10, save: 10, click: 15, inquiry: 40, purchase: 25 },
  purchases: { engagement: 10, save: 10, click: 15, inquiry: 15, purchase: 50 },
};

/**
 * 성과 점수: engagement/save/click/inquiry/purchase components, each
 * normalized 0-100 against a benchmark rate, weighted by the campaign's
 * goal-specific preset (defaults to the "inquiries" preset — 15/15/20/30/20 —
 * when no goal is known).
 */
export function computePerformanceScore(ratios: PerformanceRatios, goal: CampaignGoal | null): number {
  const preset = GOAL_WEIGHT_PRESETS[goal ?? "inquiries"];

  const engagementScore = normalize(ratios.engagementRate, BENCHMARKS.engagementRate);
  const saveScore = normalize(ratios.saveRate, BENCHMARKS.saveRate);
  const clickScore = normalize(ratios.clickRate, BENCHMARKS.clickRate);
  const inquiryScore = normalize(ratios.inquiryConversionRate, BENCHMARKS.inquiryConversionRate);
  const purchaseScore = normalize(ratios.purchaseConversionRate, BENCHMARKS.purchaseConversionRate);

  const total =
    (engagementScore * preset.engagement +
      saveScore * preset.save +
      clickScore * preset.click +
      inquiryScore * preset.inquiry +
      purchaseScore * preset.purchase) /
    100;

  return Math.round(Math.min(100, Math.max(0, total)) * 100) / 100;
}
