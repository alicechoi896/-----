import "server-only";
import type { ChatContentPart } from "../providers/types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

const MAX = 10;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * 블로그 사진 설명 (AI Vision): 브라우저가 줄인 미리보기(가로 512px)만 받고 저장하지 않는다.
 * 설명은 본문에 [사진n] 자리를 알맞게 넣는 데 쓴다.
 */
export const photoCaptioner = {
  async describe(input: { images?: { mediaType: string; data: string }[]; productName?: string }): Promise<{ captions: string[]; provider: string }> {
    const images = Array.isArray(input.images) ? input.images : [];
    if (!images.length) throw new AppError("VALIDATION", "설명할 사진이 없습니다.");
    if (images.length > MAX) throw new AppError("VALIDATION", `사진은 ${MAX}장까지 설명할 수 있습니다.`);
    if (images.some((i) => !TYPES.includes(i.mediaType as (typeof TYPES)[number]) || typeof i.data !== "string" || i.data.length < 100 || i.data.length > 1_500_000)) {
      throw new AppError("VALIDATION", "사진 형식이 올바르지 않습니다.");
    }
    const ai = await getAIProvider();
    if (!ai.supportsVision) {
      throw new AppError("VISION_REQUIRED", "사진 설명은 실제 AI 가 필요합니다. 설정 → API 연결 센터에서 Claude 또는 OpenAI 를 연결해 주세요. (설명은 직접 입력해도 됩니다)", 400);
    }
    const template = getPromptTemplate("photo.caption");
    const parts: ChatContentPart[] = [
      ...images.flatMap((img, i): ChatContentPart[] => [
        { type: "text", text: `사진${i + 1}` },
        { type: "image", mediaType: img.mediaType as (typeof TYPES)[number], data: img.data },
      ]),
      { type: "text", text: `${template.task}${input.productName ? ` (제품: ${String(input.productName).slice(0, 60)})` : ""} 사진은 ${images.length}장이다.` },
    ];
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "photo-caption",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: parts },
      ],
      outputKeys: ["captions"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["captions"],
        properties: { captions: { type: "array", items: { type: "string" } } },
      },
      variables: { count: images.length },
      maxTokens: 800,
    });
    const raw = Array.isArray(result.data.captions) ? result.data.captions.map((c) => String(c).trim().slice(0, 40)) : [];
    const captions = images.map((_, i) => raw[i] || "제품 사진");
    return { captions, provider: `${result.provider}/${result.model}` };
  },
};
