import { describe, expect, it } from "vitest";
import {
  knowledgeExtractionSchema,
  strategyGenerationSchema,
  performanceAnalysisSchema,
  featureScoresSchema,
} from "@/lib/ai/schemas";

describe("knowledgeExtractionSchema", () => {
  it("accepts a well-formed AI extraction payload", () => {
    const result = knowledgeExtractionSchema.safeParse({
      entities: [
        {
          type: "customer_problem",
          name: "콘텐츠를 올려도 매출로 연결되지 않음",
          summary: "정보성 콘텐츠는 있으나 상품과 연결되는 고객 여정이 부족함",
          confidence: 0.92,
          evidenceChunkIndexes: [0, 2],
        },
      ],
      relations: [
        {
          source: "콘텐츠를 올려도 매출로 연결되지 않음",
          target: "고객 여정 설계",
          relationType: "SOLVED_BY",
          description: "콘텐츠와 상품 사이의 전환 구조가 필요함",
          confidence: 0.89,
        },
      ],
      decisionRules: [
        {
          name: "매출 전환 콘텐츠 판단",
          condition: "조회수는 있으나 상담이 적은 경우",
          action: "문제 진단형 콘텐츠 비중을 확대",
          reason: "대중적 관심과 구매 고객의 문제 인식은 다를 수 있음",
          category: "conversion",
          weight: 0.8,
          confidence: 0.86,
        },
      ],
      brandProfile: {
        coreMessage: "",
        tone: [],
        preferredExpressions: [],
        prohibitedExpressions: [],
        targetAudiences: [],
        persuasionStructure: [],
        expertiseAreas: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown entity type", () => {
    const result = knowledgeExtractionSchema.safeParse({
      entities: [{ type: "not_a_real_type", name: "x", summary: "x", confidence: 0.5, evidenceChunkIndexes: [] }],
      relations: [],
      decisionRules: [],
      brandProfile: {
        coreMessage: "",
        tone: [],
        preferredExpressions: [],
        prohibitedExpressions: [],
        targetAudiences: [],
        persuasionStructure: [],
        expertiseAreas: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects confidence scores outside 0-1", () => {
    const result = knowledgeExtractionSchema.safeParse({
      entities: [{ type: "product", name: "x", summary: "x", confidence: 1.5, evidenceChunkIndexes: [] }],
      relations: [],
      decisionRules: [],
      brandProfile: {
        coreMessage: "",
        tone: [],
        preferredExpressions: [],
        prohibitedExpressions: [],
        targetAudiences: [],
        persuasionStructure: [],
        expertiseAreas: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("defaults missing optional arrays instead of failing", () => {
    const result = knowledgeExtractionSchema.safeParse({
      brandProfile: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entities).toEqual([]);
      expect(result.data.relations).toEqual([]);
    }
  });
});

describe("featureScoresSchema", () => {
  it("rejects scores above 100", () => {
    const result = featureScoresSchema.safeParse({
      clarity: 101,
      authority: 50,
      purchaseLink: 50,
      brandFit: 50,
      novelty: 50,
      empathy: 50,
    });
    expect(result.success).toBe(false);
  });
});

describe("strategyGenerationSchema", () => {
  it("requires at least one strategy", () => {
    const result = strategyGenerationSchema.safeParse({ strategies: [] });
    expect(result.success).toBe(false);
  });
});

describe("performanceAnalysisSchema", () => {
  it("requires at least one next-content suggestion", () => {
    const result = performanceAnalysisSchema.safeParse({
      whatWorked: [],
      whatUnderperformed: [],
      viewsVsPurchaseGap: "격차 없음",
      keepElements: [],
      reviseElements: [],
      nextContentSuggestions: [],
    });
    expect(result.success).toBe(false);
  });
});
