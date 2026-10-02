import "server-only";
import { findCatalogByTitle } from "@/lib/mock/product-catalog";
import type { OutputSection } from "@/lib/generators/types";
import type { ProductAnalysisContent, RawProductData } from "@/lib/types";
import type { GenerationContext } from "../../ai/context-types";
import { serverConfig } from "../../config";
import type {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
} from "../types";
import { writeMockContent } from "./mock-writer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock AI Provider — 외부 호출 없이 AIProvider 계약을 그대로 지킨다.
 * task 이름으로 분기해서 variables 를 보고 결정적인 결과를 만든다.
 * 실제 Provider 와 같은 입력(messages)을 받으므로, 프롬프트 조립 흐름은 실제와 동일하게 검증된다.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  readonly kind = "ai" as const;
  readonly label = "Mock AI";
  readonly model = "mock-writer-v1";

  async testConnection() {
    return { ok: true, message: "Mock AI 는 항상 사용 가능합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    await sleep(serverConfig.mockLatencyMs);
    const last = request.messages.at(-1)?.content ?? "";
    return { text: `(Mock 응답) ${last.slice(0, 80)}`, provider: this.id, model: this.model };
  }

  async generateStructured<T extends Record<string, unknown>>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    await sleep(serverConfig.mockLatencyMs);
    const v = request.variables;

    if (request.task === "product-analysis") {
      const data = mockAnalyzeProduct(v.raw as RawProductData);
      return { data: data as unknown as T, provider: this.id, model: "mock-analyzer-v1" };
    }

    if (request.task.startsWith("content:")) {
      const data = writeMockContent({
        featureId: v.featureId as string,
        outputs: v.outputs as OutputSection[],
        input: v.input as Record<string, unknown>,
        context: v.context as GenerationContext,
      });
      return { data: data as unknown as T, provider: this.id, model: this.model };
    }

    throw new Error(`MockAIProvider: 지원하지 않는 task 입니다 (${request.task})`);
  }
}

/** 카탈로그에 있는 제품은 준비된 분석을, 없는 제품은 원문에서 규칙 기반으로 요약한다 */
function mockAnalyzeProduct(raw: RawProductData): ProductAnalysisContent {
  const known = findCatalogByTitle(raw.title);
  if (known) return structuredClone(known.analysis);

  const sentences = raw.descriptionText
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  const specs = Object.entries(raw.specs).map(([k, v]) => `${k} ${v}`);
  const features = (specs.length ? specs : sentences).slice(0, 5);
  const name = raw.title || "이름 없는 제품";
  const short = name.split(" ").slice(0, 2).join(" ");

  return {
    basicInfo: {
      name,
      brand: raw.brand ?? "미확인",
      category: raw.category ?? "미분류",
      seller: raw.seller ?? "직접 입력",
      url: raw.url ?? "",
    },
    summary: {
      oneLiner: sentences[0] ? `${sentences[0]}` : `${name} 제품`,
      keyFeatures: features,
      keyBenefits: sentences.slice(1, 4).length ? sentences.slice(1, 4) : ["원문에서 장점을 찾지 못했습니다. 직접 보완해 주세요."],
      differentiators: sentences.slice(4, 6),
      targetAudience: ["원문 정보가 부족합니다. 추천 대상을 직접 입력해 주세요."],
      buyingPoints: raw.price ? [`가격 ${raw.price.toLocaleString("ko-KR")}원`] : [],
      cautions: ["원문에 명시되지 않은 효능·효과는 쓰지 않습니다."],
    },
    contentData: {
      videoPoints: features.slice(0, 3).map((f) => `${f} 보여주기`),
      blogPoints: ["스펙 표 정리", "구매 전 확인 사항"],
      keywords: [short, `${short} 추천`, `${short} 후기`].filter(Boolean),
      hooks: [`${short}, 사기 전에 이것부터 보세요`],
      forbiddenExpressions: ["100% 효과", "최고", "완벽"],
    },
  };
}
