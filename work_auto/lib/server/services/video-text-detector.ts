import "server-only";
import type { ChatContentPart } from "../providers/types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

const MAX_FRAMES = 30;

export interface DetectInput {
  frames?: { t: number; data: string }[];
}

export interface DetectResult {
  frames: { t: number; boxes: { x: number; y: number; w: number; h: number }[] }[];
  provider: string;
}

const num = (v: unknown) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));

/**
 * 영상 화면들에서 "덧씌운 글자" 위치 찾기 (AI Vision).
 * 브라우저가 줄인 화면(가로 360px JPEG)만 받고 저장하지 않는다. 좌표는 0~1000 정규화.
 */
export const videoTextDetector = {
  async detect(input: DetectInput): Promise<DetectResult> {
    const frames = Array.isArray(input.frames) ? input.frames.slice(0, MAX_FRAMES) : [];
    if (!frames.length) throw new AppError("VALIDATION", "분석할 화면이 없습니다.");
    if (frames.some((f) => typeof f.data !== "string" || f.data.length < 100 || f.data.length > 400_000)) {
      throw new AppError("VALIDATION", "화면 이미지 형식이 올바르지 않습니다.");
    }

    const ai = await getAIProvider();
    if (!ai.supportsVision) {
      // 데모 모드: 화면 아래쪽 자막 줄과 왼쪽 위 작성자 이름 자리를 찾은 것으로 한다 (흐름 확인용)
      if (serverConfig.providerMode !== "live") {
        return {
          frames: frames.map((f, i) => ({
            t: f.t,
            boxes: [{ x: 60, y: 760, w: 880, h: 60 }, ...(i < 3 ? [{ x: 20, y: 20, w: 260, h: 40 }] : [])],
          })),
          provider: "mock",
        };
      }
      throw new AppError("VISION_REQUIRED", "글자 위치를 찾으려면 실제 AI 가 필요합니다. 설정 → API 연결 센터에서 Claude 또는 OpenAI 를 연결해 주세요.", 400);
    }

    const template = getPromptTemplate("video.text-detect");
    const parts: ChatContentPart[] = [
      ...frames.flatMap((f, i): ChatContentPart[] => [
        { type: "text", text: `화면 ${i} (${f.t.toFixed(1)}초)` },
        { type: "image", mediaType: "image/jpeg", data: f.data },
      ]),
      { type: "text", text: `${template.task} 화면은 모두 ${frames.length}장이다. frames 배열에 화면 번호(index)마다 하나씩 넣는다.` },
    ];
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "video-text-detect",
      messages: [
        { role: "system", content: template.system },
        { role: "user", content: parts },
      ],
      outputKeys: ["frames"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["frames"],
        properties: {
          frames: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "boxes"],
              properties: {
                index: { type: "integer" },
                boxes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["x", "y", "w", "h", "kind"],
                    properties: {
                      x: { type: "integer" },
                      y: { type: "integer" },
                      w: { type: "integer" },
                      h: { type: "integer" },
                      kind: { type: "string", enum: ["subtitle", "name", "watermark", "logo", "sticker"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      variables: { count: frames.length },
      maxTokens: 6000,
    });

    const byIndex = new Map<number, { x: number; y: number; w: number; h: number }[]>();
    const raw = Array.isArray(result.data.frames) ? (result.data.frames as Record<string, unknown>[]) : [];
    for (const f of raw) {
      const idx = Number(f.index);
      const boxes = (Array.isArray(f.boxes) ? (f.boxes as Record<string, unknown>[]) : [])
        .map((b) => ({ x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) }))
        .filter((b) => b.w >= 5 && b.h >= 5 && b.x + b.w <= 1005 && b.y + b.h <= 1005);
      if (Number.isInteger(idx) && idx >= 0 && idx < frames.length) byIndex.set(idx, boxes);
    }
    return {
      frames: frames.map((f, i) => ({ t: f.t, boxes: byIndex.get(i) ?? [] })),
      provider: `${result.provider}/${result.model}`,
    };
  },
};
