import { z } from "zod";

// ---------------------------------------------------------------------------
// Knowledge extraction (AI 학습 파이프라인 — section 6)
// ---------------------------------------------------------------------------

export const entityTypeSchema = z.enum([
  "company",
  "product",
  "audience",
  "customer_problem",
  "desire",
  "objection",
  "solution",
  "expertise",
  "philosophy",
  "content_pattern",
  "brand_expression",
  "prohibited_expression",
  "platform_rule",
]);

export const extractedEntitySchema = z.object({
  type: entityTypeSchema,
  name: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1),
  evidenceChunkIndexes: z.array(z.number().int().min(0)),
});

export const extractedRelationSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  relationType: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
});

export const extractedDecisionRuleSchema = z.object({
  name: z.string().min(1).max(200),
  condition: z.string().min(1).max(500),
  action: z.string().min(1).max(500),
  reason: z.string().min(1).max(500),
  category: z.string().min(1).max(100),
  weight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const brandProfileSchema = z.object({
  coreMessage: z.string().max(500),
  tone: z.array(z.string()),
  preferredExpressions: z.array(z.string()),
  prohibitedExpressions: z.array(z.string()),
  targetAudiences: z.array(z.string()),
  persuasionStructure: z.array(z.string()),
  expertiseAreas: z.array(z.string()),
});

export const knowledgeExtractionSchema = z.object({
  entities: z.array(extractedEntitySchema),
  relations: z.array(extractedRelationSchema),
  decisionRules: z.array(extractedDecisionRuleSchema),
  brandProfile: brandProfileSchema,
});

export type KnowledgeExtraction = z.infer<typeof knowledgeExtractionSchema>;

// ---------------------------------------------------------------------------
// Strategy generation (전략 시뮬레이터 — section 11)
// ---------------------------------------------------------------------------

export const featureScoresSchema = z.object({
  clarity: z.number().min(0).max(100),
  authority: z.number().min(0).max(100),
  purchaseLink: z.number().min(0).max(100),
  brandFit: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100),
  empathy: z.number().min(0).max(100),
});

export const strategyOptionAiSchema = z.object({
  strategyType: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1000),
  targetProblem: z.string().min(1).max(500),
  coreMessage: z.string().min(1).max(500),
  contentDirection: z.string().min(1).max(1000),
  funnelStep: z.string().min(1).max(100),
  recommendedPlatforms: z.array(z.string()).min(1),
  contentMix: z.array(z.object({ platform: z.string(), ratio: z.number().min(0).max(100) })),
  featureScores: featureScoresSchema,
  reasoning: z.string().min(1).max(2000),
  risks: z.array(z.string()),
  advantages: z.array(z.string()),
  evidenceChunkIndexes: z.array(z.number().int().min(0)),
  appliedDecisionRuleNames: z.array(z.string()),
});

export const strategyGenerationSchema = z.object({
  strategies: z.array(strategyOptionAiSchema).min(1).max(6),
});

export type StrategyOptionAi = z.infer<typeof strategyOptionAiSchema>;

// ---------------------------------------------------------------------------
// Content generation (콘텐츠 오케스트레이터 — section 12)
// ---------------------------------------------------------------------------

export const naverBlogContentSchema = z.object({
  searchIntent: z.string(),
  title: z.string(),
  intro: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  seoKeywords: z.array(z.string()),
  callToAction: z.string(),
  seoMetaDescription: z.string(),
});

export const instagramContentSchema = z.object({
  hook: z.string(),
  slides: z.array(z.string()).min(7).max(10),
  caption: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
});

export const threadsContentSchema = z.object({
  firstPost: z.string(),
  thread: z.array(z.string()).min(5).max(8),
  closingPrompt: z.string(),
});

export const youtubeShortsContentSchema = z.object({
  hook: z.string(),
  scenes: z.array(z.object({ scene: z.string(), script: z.string(), caption: z.string() })),
  estimatedDurationSeconds: z.number().min(5).max(180),
  titleOptions: z.array(z.string()).min(5).max(5),
  callToAction: z.string(),
});

export const newsletterContentSchema = z.object({
  titleOptions: z.array(z.string()).min(1),
  preheader: z.string(),
  intro: z.string(),
  caseStudy: z.string(),
  mainContent: z.string(),
  callToAction: z.string(),
});

export const landingPageContentSchema = z.object({
  headline: z.string(),
  problem: z.string(),
  solution: z.string(),
  differentiators: z.array(z.string()),
  trustElements: z.array(z.string()),
  productDetails: z.string(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  callToAction: z.string(),
});

export const platformContentSchemas = {
  naver_blog: naverBlogContentSchema,
  instagram: instagramContentSchema,
  threads: threadsContentSchema,
  youtube_shorts: youtubeShortsContentSchema,
  newsletter: newsletterContentSchema,
  landing_page: landingPageContentSchema,
} as const;

export type PlatformContent = {
  naver_blog: z.infer<typeof naverBlogContentSchema>;
  instagram: z.infer<typeof instagramContentSchema>;
  threads: z.infer<typeof threadsContentSchema>;
  youtube_shorts: z.infer<typeof youtubeShortsContentSchema>;
  newsletter: z.infer<typeof newsletterContentSchema>;
  landing_page: z.infer<typeof landingPageContentSchema>;
};

// ---------------------------------------------------------------------------
// Performance analysis (성과 학습센터 — section 14)
// ---------------------------------------------------------------------------

export const performanceAnalysisSchema = z.object({
  whatWorked: z.array(z.string()),
  whatUnderperformed: z.array(z.string()),
  viewsVsPurchaseGap: z.string(),
  keepElements: z.array(z.string()),
  reviseElements: z.array(z.string()),
  nextContentSuggestions: z.array(z.string()).min(1),
});

export type PerformanceAnalysis = z.infer<typeof performanceAnalysisSchema>;

// ---------------------------------------------------------------------------
// Content-strategy fit analysis (사용자가 직접 등록한 콘텐츠 vs 전략)
// ---------------------------------------------------------------------------

export const contentFitAnalysisSchema = z.object({
  fitScore: z.number().min(0).max(100),
  matchedElements: z.array(z.string()),
  mismatchedElements: z.array(z.string()),
  suggestions: z.array(z.string()),
  summary: z.string().min(1).max(1000),
});

export type ContentFitAnalysis = z.infer<typeof contentFitAnalysisSchema>;
