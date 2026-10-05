import "server-only";
import { TITLE_TRANSLATE_LIMITS, isChineseTitle, titleForTranslation } from "@/lib/social-title";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

/**
 * 영상 검색 결과 제목 → 한국어 (한 페이지를 묶어 기본 AI 1회). docs/SOCIAL_VIDEO_SOURCING.md
 * - 검색 결과 표시와 따로 (화면이 결과를 먼저 보여 주고 뒤에서 부른다)
 * - 중국어 제목만, 제목만 보낸다. 결과는 저장하지 않는다 (화면 세션 기억만)
 * - 응답은 id 로 원래 결과와 짝을 맞춘다 (순서에 기대지 않음)
 */
export const titleTranslateService = {
  async translate(input: { items?: unknown }): Promise<{ items: { id: string; translatedTitle: string }[]; provider: string | null }> {
    const raw = Array.isArray(input.items) ? input.items : [];
    const items: { id: string; title: string }[] = [];
    const seen = new Set<string>();
    for (const r of raw) {
      const id = String((r as { id?: unknown })?.id ?? "").slice(0, 80);
      const title = titleForTranslation(String((r as { title?: unknown })?.title ?? ""));
      if (!id || seen.has(id) || !isChineseTitle(title)) continue;
      seen.add(id);
      items.push({ id, title });
      if (items.length >= TITLE_TRANSLATE_LIMITS.batch) break;
    }
    if (!items.length) return { items: [], provider: null }; // 번역할 것이 없으면 AI 를 부르지 않는다
    const template = getPromptTemplate("social.title-translate");
    const ai = await getAIProvider();
    const result = await ai.generateStructured<{ items?: unknown }>({
      task: "social-title-translate",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: `${template.task}\n${JSON.stringify(items)}` },
      ],
      outputKeys: ["items"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["id", "translatedTitle"], properties: { id: { type: "string" }, translatedTitle: { type: "string" } } },
          },
        },
      },
      variables: { items },
      maxTokens: 120 + items.length * 60,
    });
    const want = new Set(items.map((i) => i.id));
    const out: { id: string; translatedTitle: string }[] = [];
    for (const r of Array.isArray(result.data.items) ? result.data.items : []) {
      const id = String((r as { id?: unknown })?.id ?? "");
      const t = String((r as { translatedTitle?: unknown })?.translatedTitle ?? "").trim().slice(0, 120);
      if (want.has(id) && t) {
        out.push({ id, translatedTitle: t });
        want.delete(id);
      }
    }
    if (!out.length) throw new AppError("AI_BAD_OUTPUT", "제목을 번역하지 못했습니다.", 502);
    return { items: out, provider: `${result.provider}/${result.model}` };
  },
};
