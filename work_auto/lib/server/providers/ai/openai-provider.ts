import "server-only";
import { AppError } from "../../http";
import type {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
} from "../types";

/**
 * OpenAI Provider (Chat Completions API, fetch 기반).
 * - PROVIDER_MODE=live 이고 API 연결 센터에서 OpenAI 가 연결되어 있을 때만 쓰인다.
 * - SDK 대신 fetch 를 써서 의존성을 줄였다. SDK 로 바꿔도 이 파일만 수정하면 된다.
 * - API Key 는 생성자로만 받고, 로그에 남기지 않는다.
 */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  readonly kind = "ai" as const;
  readonly label = "OpenAI";
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.headers(), cache: "no-store" });
      if (res.ok) return { ok: true, message: "OpenAI API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
      return { ok: false, message: `OpenAI 응답 오류 (HTTP ${res.status})`, testedAt, mock: false };
    } catch {
      return { ok: false, message: "OpenAI 서버에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }

  private async chat(request: TextGenerationRequest, json: boolean) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      cache: "no-store",
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      throw new AppError("AI_PROVIDER_ERROR", `OpenAI 호출 실패 (HTTP ${res.status})`, 502);
    }
    const body = (await res.json()) as {
      choices: { message: { content: string | null } }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: body.choices[0]?.message.content ?? "",
      usage: body.usage ? { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens } : undefined,
    };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const { content, usage } = await this.chat(request, false);
    return { text: content, provider: this.id, model: this.model, usage };
  }

  async generateStructured<T extends Record<string, unknown>>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    const { content, usage } = await this.chat(request, true);
    let data: T;
    try {
      data = JSON.parse(content) as T;
    } catch {
      throw new AppError("AI_BAD_OUTPUT", "AI 응답을 JSON 으로 해석할 수 없습니다.", 502);
    }
    return { data, provider: this.id, model: this.model, usage };
  }
}
