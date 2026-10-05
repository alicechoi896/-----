import "server-only";
import { findHonestyViolations } from "@/lib/domain/honesty";
import { APPENDABLE_KEYS, APPEND_MAX_ITEMS, mergeAppend } from "@/lib/generators/append";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { findFeature } from "@/lib/registry";
import { isListFormat, type OutputSection } from "@/lib/generators/types";
import type { ChannelId, GenerateContentRequest, GeneratedContent, GeneratedValue } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { buildGenerationContext } from "../ai/context-builder";
import { renderContentPrompt } from "../ai/prompts/render";
import { getPromptTemplate } from "../ai/prompts/templates";
import { requireAccess } from "../auth";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { pruneContentHistory } from "./content-history";
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
/** 출력 형식 강제: 목록·태그는 문자열 배열, 텍스트는 문자열 (Claude structured outputs) */
function outputSchema(outputs: OutputSection[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: outputs.map((o) => o.key),
    properties: Object.fromEntries(
      outputs.map((o) => [
        o.key,
        isListFormat(o.format)
          ? { type: "array", items: { type: "string" }, description: `${o.label}${o.count ? ` (${o.count}개)` : ""}` }
          : { type: "string", description: o.label },
      ]),
    ),
  };
}

/** AI 응답 → 저장 형식 (목록은 배열, 텍스트는 문자열) */
function normalizeOutput(outputs: OutputSection[], data: Record<string, unknown>): Record<string, GeneratedValue> {
  const output: Record<string, GeneratedValue> = {};
  for (const section of outputs) {
    const raw = data[section.key];
    const isList = isListFormat(section.format);
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
  return output;
}

/** 다시 만들 때 함께 바꾸는 항목: 블로그 본문을 바꾸면 소제목도 본문에 맞게 */
const LINKED_SECTIONS: Record<string, string[]> = { body: ["headings"] };

export const contentGenerationService = {
  async generate({ featureId, input }: GenerateContentRequest): Promise<GeneratedContent> {
    const feature = findFeature(featureId);
    const config = findGeneratorConfig(featureId);
    if (!feature || !config) throw new AppError("UNKNOWN_FEATURE", "생성 기능을 찾을 수 없습니다.", 404);
    if (feature.channelId === "settings") throw new AppError("UNKNOWN_FEATURE", "생성 기능이 아닙니다.", 400);
    const channelId = feature.channelId as ChannelId;

    // 1) 입력 검증
    for (const field of config.fields) {
      if (field.type === "images") {
        // 사진은 브라우저에만 있고, 서버에는 "사진 n: 설명" 목록만 온다
        const raw = Array.isArray(input[field.name]) ? (input[field.name] as unknown[]) : [];
        input[field.name] = raw.slice(0, 10).map((c, i) => `사진${i + 1}: ${String(c ?? "").trim().slice(0, 80) || "제품 사진"}`);
      }
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
      jsonSchema: outputSchema(config.outputs),
      variables: { featureId, outputs: config.outputs, input, context },
    });

    // 5) 정규화 + 정직성 검사
    const output = normalizeOutput(config.outputs, result.data);
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
    await pruneContentHistory(userId).catch(() => 0); // 오래된 이력 정리 (실패해도 생성은 성공)
    return content;
  },

  /**
   * 결과의 한 항목만 새로 만든다 (AI 호출 1회).
   * - 후보 목록(제목·Hook·CTA·키워드·태그·해시태그, `APPENDABLE_KEYS`): **추가 만들기** — 지금 목록과 겹치지 않는 새 후보를
   *   목록 위에 더한다. 직접 수정본·체크한 후보·대표 제목은 그대로 둔다
   * - 글(대본·설명글·본문 …): **다시 만들기** — 다른 내용으로 바꾼다 (블로그 본문은 소제목도 함께)
   * - 같은 입력·Context 로 다시 조립한다 (스타일 표본은 새로 뽑힌다)
   */
  async regenerateSection(contentId: string, key: string): Promise<GeneratedContent> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const content = await repo.contents.get(contentId);
    if (!content || content.userId !== userId) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    const config = findGeneratorConfig(content.featureId);
    if (!config) throw new AppError("UNKNOWN_FEATURE", "생성 기능을 찾을 수 없습니다.", 404);
    await requireAccess(content.featureId); // 생성 기능 등급 권한
    const keys = [key, ...(LINKED_SECTIONS[key] ?? [])];
    const sections = config.outputs.filter((o) => keys.includes(o.key));
    if (!sections.length) throw new AppError("VALIDATION", "다시 만들 수 없는 항목입니다.");
    const append = APPENDABLE_KEYS.has(key);
    const asList = (v: GeneratedValue | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
    // 화면에 보이는 목록 (직접 수정했다면 수정본)
    const shown = (k: string) => content.context.userEdits?.[k]?.value ?? content.output[k];
    if (append && asList(shown(key)).length >= APPEND_MAX_ITEMS) {
      throw new AppError("VALIDATION", `후보는 ${APPEND_MAX_ITEMS}개까지 모을 수 있습니다. [직접 수정]에서 안 쓸 후보를 지운 뒤 추가해 주세요.`);
    }

    const input = { ...content.input };
    const context = await buildGenerationContext({ userId, featureId: content.featureId, channelId: content.channelId, config, input });
    const template = getPromptTemplate(config.promptId);
    const messages = renderContentPrompt(template, { ...config, outputs: sections }, input, context);

    // 지금 결과: 다시 만들 항목은 "겹치지 말 것", 나머지는 "어울리게" 참고용 (길이 제한)
    const clip = (v: GeneratedValue | undefined, n: number) => JSON.stringify(v ?? "").slice(0, n);
    const current = sections.map((o) => `- ${o.label}: ${append ? clip(shown(o.key), 6000) : clip(content.output[o.key], 1500)}`).join("\n");
    const others = config.outputs
      .filter((o) => !keys.includes(o.key))
      .map((o) => `- ${o.label}: ${clip(content.output[o.key], 300)}`)
      .join("\n");
    messages.push({
      role: "user",
      content: [
        ...(append
          ? [
              `[추가 만들기] 아래 항목의 새 후보만 만든다: ${sections.map((o) => `${o.label} ${o.count ?? 10}개`).join(", ")}. 지금 목록에 더할 것이다.`,
              "지금 목록에 있는 것과 같거나 거의 같은 후보(조사·어순만 바꾼 것 포함)는 쓰지 않는다. 다른 각도·다른 표현으로. 형식·규칙은 위와 같다.",
              "[지금 목록 — 겹치지 말 것]",
            ]
          : [
              `[다시 만들기] 아래 항목만 새로 만든다: ${sections.map((o) => o.label).join(", ")}.`,
              "지금 결과와 겹치지 않게 다른 표현·다른 각도로 쓴다. 같은 문장을 다시 쓰지 않는다. 형식·개수·규칙은 위와 같다.",
              "[지금 결과 — 피할 것]",
            ]),
        current,
        others ? "[같은 콘텐츠의 다른 항목 — 어울리게 참고]" : "",
        others,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content-regenerate:${content.featureId}`,
      messages,
      outputKeys: sections.map((o) => o.key),
      jsonSchema: outputSchema(sections),
      variables: { featureId: content.featureId, outputs: sections, input, context, previous: content.output, append },
    });
    const fresh = normalizeOutput(sections, result.data);
    const userEdits = { ...(content.context.userEdits ?? {}) };
    const picks = { ...(content.context.picks ?? {}) };
    let output: Record<string, GeneratedValue>;
    let headline = content.headline;
    if (append) {
      // 원본 목록과 (직접 수정했다면) 수정본 목록 모두 위에 새 후보를 더한다. 체크한 후보는 그대로
      const added = asList(fresh[key]);
      const edited = userEdits[key];
      const forShown = mergeAppend(asList(shown(key)), added);
      if (!forShown.added.length) throw new AppError("NO_NEW_ITEMS", "겹치지 않는 새 후보를 만들지 못했습니다. 한 번 더 눌러 주세요.", 422);
      if (edited) userEdits[key] = { ...edited, value: forShown.list };
      output = { ...content.output, [key]: mergeAppend(asList(content.output[key]), added).list };
    } else {
      output = { ...content.output, ...fresh };
      const headlineValue = output[config.headlineKey];
      headline = (Array.isArray(headlineValue) ? headlineValue[0] : headlineValue) || content.headline;
      for (const k of keys) {
        delete userEdits[k];
        delete picks[k];
      }
    }
    const notes = [...content.context.notes];
    if (context.honestyGuard) {
      const violations = findHonestyViolations(JSON.stringify(fresh));
      if (violations.length) notes.push(`정직성 검사 경고(${append ? "추가 만들기" : "다시 만들기"}): "${violations.join('", "')}" 표현 확인 필요`);
    }
    const regenerated = [...(content.context.regenerated ?? []), { key, at: nowIso(), provider: result.provider, ...(append ? { mode: "append" as const } : {}) }].slice(-20);
    const updated = await repo.contents.update(content.id, { output, headline, context: { ...content.context, notes, regenerated, userEdits, picks } });
    if (!updated) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return updated;
  },
};
