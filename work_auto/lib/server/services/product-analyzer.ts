import "server-only";
import type { AnalysisMeta, ProductAnalysisContent, RawProductData } from "@/lib/types";
import { renderProductAnalysisPrompt } from "../ai/prompts/render";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import type { ChatContentPart } from "../providers/types";

const stringArray = { type: "array", items: { type: "string" } };

/** 제품 분석 결과 JSON 스키마 (Claude structured outputs 가 이 형식을 강제한다) */
const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["basicInfo", "summary", "contentData"],
  properties: {
    basicInfo: {
      type: "object",
      additionalProperties: false,
      required: ["name", "brand", "category", "seller", "url"],
      properties: {
        name: { type: "string" },
        brand: { type: "string" },
        category: { type: "string" },
        seller: { type: "string" },
        url: { type: "string" },
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["oneLiner", "keyFeatures", "keyBenefits", "differentiators", "targetAudience", "buyingPoints", "cautions"],
      properties: {
        oneLiner: { type: "string" },
        keyFeatures: stringArray,
        keyBenefits: stringArray,
        differentiators: stringArray,
        targetAudience: stringArray,
        buyingPoints: stringArray,
        cautions: stringArray,
      },
    },
    contentData: {
      type: "object",
      additionalProperties: false,
      required: ["videoPoints", "blogPoints", "keywords", "hooks", "forbiddenExpressions"],
      properties: {
        videoPoints: stringArray,
        blogPoints: stringArray,
        keywords: stringArray,
        hooks: stringArray,
        forbiddenExpressions: stringArray,
      },
    },
  },
} as const;

/** 한 번에 보낼 수 있는 이미지 조각 수 (요청 크기와 AI 입력 한도를 고려) */
export const MAX_IMAGES_PER_EXTRACT = 8;

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
      jsonSchema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      variables: { raw },
      temperature: 0.2,
    });

    const analysis = normalizeAnalysis(result.data, raw);
    return {
      analysis,
      meta: { provider: result.provider, model: result.model, promptId: template.id, promptVersion: template.version },
    };
  },

  /**
   * 상세페이지 이미지 조각 → 텍스트 (Vision). 이미지는 이 호출에만 쓰고 저장하지 않는다.
   * Mock AI 는 이미지를 읽지 못하므로 실제 AI 연결을 안내한다.
   */
  async extractFromImages(images: { mediaType: string; data: string }[], partLabel?: string): Promise<{ text: string; provider: string }> {
    if (!Array.isArray(images) || images.length === 0) throw new AppError("VALIDATION", "읽을 이미지가 없습니다.");
    if (images.length > MAX_IMAGES_PER_EXTRACT) throw new AppError("VALIDATION", `한 번에 ${MAX_IMAGES_PER_EXTRACT}장까지 보낼 수 있습니다.`);
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (images.some((i) => !allowed.includes(i.mediaType) || typeof i.data !== "string" || i.data.length < 100)) {
      throw new AppError("VALIDATION", "이미지 형식이 올바르지 않습니다. (JPG, PNG, WEBP)");
    }

    const ai = await getAIProvider();
    if (!ai.supportsVision) {
      throw new AppError(
        "VISION_REQUIRED",
        "이미지 읽기는 실제 AI 가 필요합니다. 설정 → API 연결 센터에서 Claude 또는 OpenAI 를 연결해 주세요.",
        400,
      );
    }
    const template = getPromptTemplate("product.image-extract");
    const parts: ChatContentPart[] = [
      ...images.map(
        (i): ChatContentPart => ({ type: "image", mediaType: i.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: i.data }),
      ),
      { type: "text", text: `${template.task}${partLabel ? ` (${partLabel})` : ""}` },
    ];
    const result = await ai.generateText({
      task: "product-image-extract",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: parts },
      ],
      maxTokens: 8000,
    });
    return { text: result.text.trim(), provider: `${result.provider}/${result.model}` };
  },
};

/** AI 응답 검증 + 누락 필드 보정. AI 출력은 항상 이렇게 정규화한 뒤 저장한다 */
function normalizeAnalysis(data: Record<string, unknown>, raw: RawProductData): ProductAnalysisContent {
  const d = data as Partial<ProductAnalysisContent>;
  if (!d.summary || !d.contentData) throw new AppError("AI_BAD_OUTPUT", "제품 분석 결과 형식이 올바르지 않습니다.", 502);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((s) => s.trim()) : []);
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
