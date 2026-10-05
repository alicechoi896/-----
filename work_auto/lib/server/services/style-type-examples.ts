import "server-only";
import { STYLE_LIMITS, styleItemKey } from "@/lib/style-limits";
import { STYLE_TYPE_KINDS, STYLE_TYPE_KIND_LABEL, findStyleType, type StyleTypeKind, type StyleTypeOption } from "@/lib/style-types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

/** 한 번에 만드는 예시 수 */
export const TYPE_EXAMPLE_COUNT = 30;

const KIND_GUIDE: Record<StyleTypeKind, string> = {
  hooks: "Hook: 영상 첫 3초에 말할 문장 (블로그에서는 도입 문장으로 재해석해 쓴다)",
  ctas: "CTA: 영상·글 마지막 행동 유도 문장",
  titlePatterns: "제목 패턴: 최종 제목이 아니라 설득 구조. 바뀌는 부분은 [제품] [숫자] [대상] [키워드] 처럼",
};

/**
 * 나의 스타일 > 원하는 유형 → 예시 문장 (AI 1회). 저장하지 않고 폼 목록에 채운다 (사용자가 고친 뒤 [저장]).
 * 특정 생성 1회분이 아니라 스타일 편집 도구라 Generation Context 대신 스타일 추출(style-extractor)과 같은 방식으로 부른다.
 */
export const styleTypeExamples = {
  async generate(input: { kind?: string; types?: string[]; tone?: string; existing?: string[] }): Promise<{ items: string[]; provider: string }> {
    const kind = STYLE_TYPE_KINDS.find((k) => k === input.kind);
    if (!kind) throw new AppError("VALIDATION", "Hook·CTA·제목 패턴 중 하나를 골라 주세요.");
    const types = (Array.isArray(input.types) ? input.types : []).map((id) => findStyleType(kind, String(id))).filter((t): t is StyleTypeOption => Boolean(t));
    if (!types.length) throw new AppError("VALIDATION", "원하는 유형을 1개 이상 골라 주세요.");
    const existing = (Array.isArray(input.existing) ? input.existing : []).map(String).filter(Boolean).slice(0, STYLE_LIMITS[kind].max);
    const tone = String(input.tone ?? "").trim().slice(0, 200);

    const template = getPromptTemplate("style.type-examples");
    const ai = await getAIProvider();
    const result = await ai.generateStructured<{ items?: unknown }>({
      task: "style-type-examples",
      messages: [
        { role: "system", content: template.system },
        {
          role: "user",
          content: [
            template.task,
            `[항목] ${KIND_GUIDE[kind]}`,
            `[유형] ${types.map((t) => `${t.label}: ${t.hint} (예: ${t.examples.join(" / ")})`).join("\n")}`,
            `[개수] ${TYPE_EXAMPLE_COUNT}개`,
            tone ? `[톤] ${tone}` : "",
            existing.length ? `[이미 있는 문장 — 겹치지 말 것]\n${existing.join("\n").slice(0, 4000)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      outputKeys: ["items"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: { items: { type: "array", items: { type: "string" }, description: `${STYLE_TYPE_KIND_LABEL[kind]} 예시 ${TYPE_EXAMPLE_COUNT}개` } },
      },
      variables: { kind, types },
      maxTokens: 3500,
    });

    const seen = new Set(existing.map(styleItemKey));
    const items: string[] = [];
    for (const raw of Array.isArray(result.data.items) ? result.data.items : []) {
      const text = String(raw).replace(/\s+/g, " ").trim().slice(0, STYLE_LIMITS[kind].len);
      const key = styleItemKey(text);
      if (!text || seen.has(key)) continue;
      seen.add(key);
      items.push(text);
    }
    if (!items.length) throw new AppError("AI_BAD_OUTPUT", "겹치지 않는 예시를 만들지 못했습니다. 한 번 더 눌러 주세요.", 502);
    return { items: items.slice(0, TYPE_EXAMPLE_COUNT), provider: `${result.provider}/${result.model}` };
  },
};
