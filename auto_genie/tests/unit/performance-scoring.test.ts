import { describe, expect, it } from "vitest";
import { computeRatios, computePerformanceScore } from "@/lib/performance/scoring";

describe("computeRatios", () => {
  it("returns 0 for every rate when denominators are 0 (no division by zero)", () => {
    const ratios = computeRatios({
      impressions: 0,
      views: 0,
      likes: 0,
      comments: 0,
      saves: 0,
      clicks: 0,
      inquiries: 0,
      consultations: 0,
      purchases: 0,
    });
    expect(Object.values(ratios).every((v) => v === 0)).toBe(true);
  });

  it("computes expected rates from real metrics", () => {
    const ratios = computeRatios({
      impressions: 1000,
      views: 500,
      likes: 20,
      comments: 5,
      saves: 10,
      clicks: 25,
      inquiries: 4,
      consultations: 1,
      purchases: 2,
    });
    expect(ratios.viewRate).toBeCloseTo(0.5, 5);
    expect(ratios.engagementRate).toBeCloseTo(25 / 500, 5);
    expect(ratios.saveRate).toBeCloseTo(10 / 500, 5);
    expect(ratios.clickRate).toBeCloseTo(25 / 500, 5);
    expect(ratios.inquiryConversionRate).toBeCloseTo(5 / 500, 5);
    expect(ratios.purchaseConversionRate).toBeCloseTo(2 / 500, 5);
  });
});

describe("computePerformanceScore", () => {
  const zeroRatios = {
    viewRate: 0,
    engagementRate: 0,
    saveRate: 0,
    clickRate: 0,
    inquiryConversionRate: 0,
    purchaseConversionRate: 0,
  };

  it("scores 0 when every rate is 0", () => {
    expect(computePerformanceScore(zeroRatios, "inquiries")).toBe(0);
  });

  it("caps at 100 even when rates far exceed the benchmark", () => {
    const hot = {
      viewRate: 1,
      engagementRate: 1,
      saveRate: 1,
      clickRate: 1,
      inquiryConversionRate: 1,
      purchaseConversionRate: 1,
    };
    expect(computePerformanceScore(hot, "purchases")).toBe(100);
  });

  it("weighs purchase conversion more heavily under a purchases-goal campaign than a views-goal one", () => {
    const purchaseHeavy = { ...zeroRatios, purchaseConversionRate: 0.01 }; // at benchmark
    const purchasesGoalScore = computePerformanceScore(purchaseHeavy, "purchases");
    const viewsGoalScore = computePerformanceScore(purchaseHeavy, "views");
    expect(purchasesGoalScore).toBeGreaterThan(viewsGoalScore);
  });

  it("defaults to the inquiries preset when goal is null", () => {
    const ratios = { ...zeroRatios, inquiryConversionRate: 0.02 };
    expect(computePerformanceScore(ratios, null)).toBe(computePerformanceScore(ratios, "inquiries"));
  });
});
