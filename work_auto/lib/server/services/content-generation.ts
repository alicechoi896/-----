import "server-only";
import { findHonestyViolations } from "@/lib/domain/honesty";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { findFeature } from "@/lib/registry";
import type { ChannelId, GenerateContentRequest, GeneratedContent, GeneratedValue } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { buildGenerationContext } from "../ai/context-builder";
import { renderContentPrompt } from "../ai/prompts/render";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { productService } from "./products";

/**
 * 콘텐츠 생성 유스케이스 — 모든 생성형 기능이 이 함수 하나를 쓴다.
 *
 *  1. Generator Config 로 입력 검증
 *  2. ContextBuilder 로 AI Memory 조립
 *  3. 버전 관리되는 Prompt 템플릿으로 메시지 생성
 *  4. AIProvider.generateStructured 호출
 *  5. 결과 정규화 + 정직성 검사
 *  6. 생성 이력 저장 (promptVersion, provider, model, context 요약 포함)
 */
export const contentGenerationService = {
  async generate({ featureId, input }: GenerateContentRequest): Promise<GeneratedContent> {
    const feature = findFeature(featureId);
    const config = findGeneratorConfig(featureId);
    if (!feature || !config) throw new AppError("UNKNOWN_FEATURE", "생성 기능을 찾을 수 없습니다.", 404);
    if (feature.channelId === "settings") throw new AppError("UNKNOWN_FEATURE", "생성 기능이 아닙니다.", 400);
    const channelId = feature.channelId as ChannelId;

    // 1) 입력 검증
    for (const field of config.fields) {
      const v = input[field.name];
      const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
      if (field.required && empty) throw new AppError("VALIDATION", `${field.label}을(를) 입력해 주세요.`);
    }

    const userId = await getCurrentUserId();

    // 2) Context
    const context = await buildGenerationContext({ userId, featureId, channelId, config, input });

    // 3) Prompt
    const template = getPromptTemplate(config.promptId);
    const messages = renderContentPrompt(template, config, input, context);

    // 4) AI 호출
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content:${featureId}`,
      messages,
      outputKeys: config.outputs.map((o) => o.key),
      // 출력 형식 강제: 목록·태그는 문자열 배열, 텍스트는 문자열 (Claude structured outputs)
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: config.outputs.map((o) => o.key),
        properties: Object.fromEntries(
          config.outputs.map((o) => [
            o.key,
            o.format === "list" || o.format === "tags"
              ? { type: "array", items: { type: "string" }, description: `${o.label}${o.count ? ` (${o.count}개)` : ""}` }
              : { type: "string", description: o.label },
          ]),
        ),
      },
      variables: { featureId, outputs: config.outputs, input, context },
    });

    // 5) 정규화 + 정직성 검사
    const output: Record<string, GeneratedValue> = {};
    for (const section of config.outputs) {
      const raw = result.data[section.key];
      const isList = section.format === "list" || section.format === "tags";
      output[section.key] = isList
        ? Array.isArray(raw)
          ? raw.map(String)
          : raw
            ? [String(raw)]
            : []
        : Array.isArray(raw)
          ? raw.join("\n")
          : String(raw ?? "");
    }
    if (context.honestyGuard) {
      const violations = findHonestyViolations(JSON.stringify(output));
      if (violations.length) context.summary.notes.push(`정직성 검사 경고: "${violations.join('", "')}" 표현 확인 필요`);
    }

    const headlineValue = output[config.headlineKey];
    const headline = (Array.isArray(headlineValue) ? headlineValue[0] : headlineValue) || feature.title;

    // 6) 저장
    const content: GeneratedContent = {
      id: createId("cnt"),
      userId,
      projectId: null,
      featureId,
      channelId,
      productId: context.product?.product.id ?? null,
      input,
      output,
      headline,
      promptId: template.id,
      promptVersion: template.version,
      provider: result.provider,
      model: result.model,
      context: context.summary,
      isExemplar: false,
      rating: null,
      createdAt: nowIso(),
    };
    await getRepositories().contents.insert(content);
    if (context.product) await productService.touch(context.product.product.id);
    return content;
  },
};
