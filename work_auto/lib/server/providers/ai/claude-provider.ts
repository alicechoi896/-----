import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageParam, BetaTextBlockParam, BetaImageBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { AppError } from "../../http";
import type {
  AIProvider,
  ChatMessage,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
} from "../types";

/** 기본 모델 (사용자 선택: Claude Sonnet 5.5). 다른 모델은 CLAUDE_MODEL 환경변수로 바꾼다 */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

/**
 * Claude (Anthropic) Provider.
 * - 구조화 출력: output_config.format(JSON Schema) 로 응답 형식을 강제한다
 * - 이미지 입력 지원 (상세페이지 이미지 읽기)
 * - 안전 분류기가 요청을 거절하면(stop_reason: refusal) 서버 측 fallback 이 다른 모델로 이어서 처리한다
 *   (beta server-side-fallback-2026-07-01, fallbacks: "default")
 * - temperature 는 보내지 않는다 (이 모델은 기본값 외 temperature 를 받지 않는다). 품질·속도는 effort 로 조절한다
 */
export class ClaudeProvider implements AIProvider {
  readonly id = "claude";
  readonly kind = "ai" as const;
  readonly label = "Claude";
  readonly supportsVision = true;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_CLAUDE_MODEL,
  ) {
    // 응답이 너무 늦으면 서버 실행 시간(120초) 안에 원인이 담긴 오류로 끝낸다 (재시도 1번)
    this.client = new Anthropic({ apiKey, timeout: 100_000, maxRetries: 1 });
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      await this.client.models.retrieve(this.model);
      return { ok: true, message: `Claude API 에 정상적으로 연결되었습니다. (모델: ${this.model})`, testedAt, mock: false };
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        return { ok: false, message: "Claude API 키가 올바르지 않습니다. console.anthropic.com 에서 키를 확인해 주세요.", testedAt, mock: false };
      }
      if (e instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, message: "이 키로는 해당 모델을 사용할 권한이 없습니다. 결제(크레딧) 설정을 확인해 주세요.", testedAt, mock: false };
      }
      if (e instanceof Anthropic.NotFoundError) {
        return { ok: false, message: `모델 ${this.model} 을(를) 찾을 수 없습니다.`, testedAt, mock: false };
      }
      const status = e instanceof Anthropic.APIError ? ` (HTTP ${e.status})` : "";
      return { ok: false, message: `Claude 서버에 연결할 수 없습니다${status}.`, testedAt, mock: false };
    }
  }

  /** 우리 메시지 형식 → Claude 형식 (system 은 최상위 파라미터로 분리) */
  private split(messages: ChatMessage[]): { system: string; messages: BetaMessageParam[] } {
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n\n");
    const rest: BetaMessageParam[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((part): BetaTextBlockParam | BetaImageBlockParam =>
                part.type === "text"
                  ? { type: "text", text: part.text }
                  : { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } },
              ),
      }));
    return { system, messages: rest };
  }

  private async send(request: TextGenerationRequest, jsonSchema?: Record<string, unknown>): Promise<BetaMessage> {
    const { system, messages } = this.split(request.messages);
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 16000,
        system: system || undefined,
        messages,
        output_config: {
          effort: "medium",
          ...(jsonSchema ? { format: { type: "json_schema", schema: jsonSchema } } : {}),
        },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (response.stop_reason === "refusal") {
        throw new AppError("AI_REFUSED", "AI 가 이 요청을 처리하지 않았습니다. 입력 내용을 바꿔 다시 시도해 주세요.", 422);
      }
      if (response.stop_reason === "max_tokens") {
        throw new AppError("AI_TOO_LONG", "AI 응답이 너무 길어 중간에 끊겼습니다. 글 길이를 줄여 다시 시도해 주세요.", 422);
      }
      return response;
    } catch (e) {
      if (e instanceof AppError) throw e;
      if (e instanceof Anthropic.AuthenticationError) throw new AppError("AI_KEY", "Claude API 키가 올바르지 않습니다. API 연결 센터에서 확인해 주세요.", 400);
      if (e instanceof Anthropic.RateLimitError) throw new AppError("AI_RATE_LIMIT", "Claude 호출 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.", 429);
      if (e instanceof Anthropic.BadRequestError) {
        console.error("[claude] bad request", e.message);
        throw new AppError("AI_BAD_REQUEST", "Claude 가 요청을 처리할 수 없습니다. (이미지가 너무 크거나 형식이 맞지 않을 수 있습니다)", 400);
      }
      if (e instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AppError("AI_TIMEOUT", "Claude 응답이 100초 넘게 없어 중단했습니다. 잠시 후 다시 시도해 주세요.", 504);
      }
      if (e instanceof Anthropic.APIConnectionError) {
        throw new AppError("AI_PROVIDER_ERROR", "Claude 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", 502);
      }
      if (e instanceof Anthropic.APIError) {
        console.error("[claude] api error", e.status, e.message);
        throw new AppError("AI_PROVIDER_ERROR", `Claude 호출에 실패했습니다 (HTTP ${e.status}). 잠시 후 다시 시도해 주세요.`, 502);
      }
      throw e;
    }
  }

  private textOf(response: BetaMessage): string {
    return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  private usageOf(response: BetaMessage) {
    return { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const response = await this.send(request);
    return { text: this.textOf(response), provider: this.id, model: response.model, usage: this.usageOf(response) };
  }

  async generateStructured<T extends Record<string, unknown>>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    const response = await this.send(request, request.jsonSchema);
    const text = this.textOf(response);
    try {
      return { data: JSON.parse(text) as T, provider: this.id, model: response.model, usage: this.usageOf(response) };
    } catch {
      // 스키마 없이 호출한 경우 앞뒤 설명이 붙을 수 있어 JSON 부분만 다시 시도한다
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return { data: JSON.parse(text.slice(start, end + 1)) as T, provider: this.id, model: response.model, usage: this.usageOf(response) };
        } catch {
          /* 아래에서 오류 */
        }
      }
      throw new AppError("AI_BAD_OUTPUT", "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", 502);
    }
  }
}
