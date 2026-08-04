import "server-only";
import { generateObject, type LanguageModel } from "ai";
import type { z } from "zod";

export class StructuredGenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "StructuredGenerationError";
  }
}

/**
 * Calls generateObject against `schema`. If the model returns a payload that
 * fails schema validation, retries once with an explicit correction hint
 * before giving up — per spec, structured AI output gets exactly one
 * automatic retry, and a persistent failure must be surfaced, never silently
 * swallowed or replaced with fabricated data.
 */
export async function generateStructured<T>(options: {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}): Promise<T> {
  const attempt = async (extra?: string) => {
    const { object } = await generateObject({
      model: options.model,
      schema: options.schema,
      system: options.system,
      prompt: extra ? `${options.prompt}\n\n${extra}` : options.prompt,
    });
    return object;
  };

  try {
    return await attempt();
  } catch (firstError) {
    try {
      return await attempt(
        "이전 응답이 요구된 JSON 스키마와 일치하지 않았습니다. 스키마를 정확히 준수하여 다시 생성하세요."
      );
    } catch (secondError) {
      throw new StructuredGenerationError(
        "AI 구조화 출력 생성에 두 차례 모두 실패했습니다.",
        secondError ?? firstError
      );
    }
  }
}
