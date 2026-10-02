import "server-only";
import type { AnalysisMeta, ProductAnalysisContent, RawProductData } from "@/lib/types";
import { renderProductAnalysisPrompt } from "../ai/prompts/render";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

/**
 * AI Analyzer — RawProductData(원문) → ProductAnalysisContent(구조화 데이터).
 * Collector 와 분리되어 있으므로, 수집처가 바뀌어도 이 코드는 그대로다.
 */
export const productAnalyzer = {
  async analyze(raw: RawProductData): Promise<{ analysis: ProductAnalysisContent; meta: AnalysisMeta }> {
    const template = getPromptTemplate("product.analysis");
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "product-analysis",
      messages: renderProductAnalysisPrompt(template, raw),
      outputKeys: ["basicInfo", "summary", "contentData"],
      variables: { raw },
      temperature: 0.2,
    });

    const analysis = normalizeAnalysis(result.data, raw);
    return {
      analysis,
      meta: { provider: result.provider, model: result.model, promptId: template.id, promptVersion: template.version },
    };
  },
};

/** AI 응답 검증 + 누락 필드 보정. AI 출력은 항상 이렇게 정규화한 뒤 저장한다 */
function normalizeAnalysis(data: Record<string, unknown>, raw: RawProductData): ProductAnalysisContent {
  const d = data as Partial<ProductAnalysisContent>;
  if (!d.summary || !d.contentData) throw new AppError("AI_BAD_OUTPUT", "제품 분석 결과 형식이 올바르지 않습니다.", 502);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    basicInfo: {
      name: d.basicInfo?.name || raw.title,
      brand: d.basicInfo?.brand || raw.brand || "",
      category: d.basicInfo?.category || raw.category || "",
      seller: d.basicInfo?.seller || raw.seller || "",
      url: d.basicInfo?.url || raw.url || "",
    },
    summary: {
      oneLiner: String(d.summary.oneLiner ?? ""),
      keyFeatures: list(d.summary.keyFeatures),
      keyBenefits: list(d.summary.keyBenefits),
      differentiators: list(d.summary.differentiators),
      targetAudience: list(d.summary.targetAudience),
      buyingPoints: list(d.summary.buyingPoints),
      cautions: list(d.summary.cautions),
    },
    contentData: {
      videoPoints: list(d.contentData.videoPoints),
      blogPoints: list(d.contentData.blogPoints),
      keywords: list(d.contentData.keywords),
      hooks: list(d.contentData.hooks),
      forbiddenExpressions: list(d.contentData.forbiddenExpressions),
    },
  };
}
