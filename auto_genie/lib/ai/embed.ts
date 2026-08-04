import "server-only";
import { embedMany } from "ai";
import { embeddingModel, currentModelNames } from "./provider";

const EMBED_BATCH_SIZE = 100;

export interface EmbeddedText {
  text: string;
  embedding: number[];
}

/** Embeds a batch of texts, chunked internally to stay under provider batch limits. */
export async function embedTexts(texts: string[]): Promise<EmbeddedText[]> {
  if (texts.length === 0) return [];

  const model = embeddingModel();
  const results: EmbeddedText[] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const { embeddings } = await embedMany({ model, values: batch });
    embeddings.forEach((embedding, idx) => {
      results.push({ text: batch[idx], embedding });
    });
  }

  return results;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [result] = await embedTexts([text]);
  return result.embedding;
}

export { currentModelNames };
