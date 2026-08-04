import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { env, getEmbeddingDimension } from "@/lib/env";

/**
 * AI provider abstraction. OpenAI is the default; swapping to another
 * provider (e.g. Anthropic) means changing only this file — callers only
 * ever ask for `chatModel()` / `embeddingModel()`, never import an SDK
 * provider directly. Model ids come from env vars, never hardcoded.
 */

let cachedOpenAi: ReturnType<typeof createOpenAI> | null = null;

function openaiProvider() {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!cachedOpenAi) {
    cachedOpenAi = createOpenAI({ apiKey: env.openaiApiKey });
  }
  return cachedOpenAi;
}

export function chatModel() {
  return openaiProvider()(env.openaiChatModel);
}

export function embeddingModel() {
  return openaiProvider().textEmbeddingModel(env.openaiEmbeddingModel);
}

export function currentModelNames() {
  return {
    chatModel: env.openaiChatModel,
    embeddingModel: env.openaiEmbeddingModel,
    embeddingDimension: getEmbeddingDimension(env.openaiEmbeddingModel),
  };
}
