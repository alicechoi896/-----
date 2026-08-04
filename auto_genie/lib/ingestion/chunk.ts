import { countTokens } from "gpt-tokenizer";

const TARGET_MIN_TOKENS = 800;
const TARGET_MAX_TOKENS = 1200;
const OVERLAP_TOKENS = 100;
const MIN_CHUNK_TOKENS = 150; // avoid overly short trailing fragments

export interface TextChunk {
  index: number;
  content: string;
  tokenCount: number;
}

/** Splits text into paragraph blocks, preserving heading/paragraph structure. */
function splitIntoBlocks(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** Splits an oversized single block into sentence-level pieces so no piece exceeds the max. */
function splitOversizedBlock(block: string): string[] {
  const sentences = block.split(/(?<=[.!?。!?])\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (countTokens(candidate) > TARGET_MAX_TOKENS && current) {
      pieces.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : [block];
}

function tailOverlapText(text: string, maxTokens: number): string {
  const words = text.split(/\s+/);
  let overlap = "";
  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words[i] + (overlap ? " " + overlap : "");
    if (countTokens(candidate) > maxTokens) break;
    overlap = candidate;
  }
  return overlap;
}

/**
 * Splits text into chunks of roughly 800-1200 tokens with ~100 token overlap
 * between consecutive chunks, preserving paragraph boundaries where possible.
 */
export function chunkText(text: string): TextChunk[] {
  const rawBlocks = splitIntoBlocks(text);
  if (rawBlocks.length === 0) return [];

  const blocks = rawBlocks.flatMap((block) =>
    countTokens(block) > TARGET_MAX_TOKENS ? splitOversizedBlock(block) : [block]
  );

  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;
    const candidateTokens = countTokens(candidate);

    if (candidateTokens > TARGET_MAX_TOKENS && current) {
      chunks.push(current);
      const overlap = tailOverlapText(current, OVERLAP_TOKENS);
      current = overlap ? `${overlap}\n\n${block}` : block;
    } else {
      current = candidate;
      if (candidateTokens >= TARGET_MIN_TOKENS) {
        // Block boundary reached inside the target range; keep growing until
        // the next block would overflow, handled by the branch above.
      }
    }
  }
  if (current) chunks.push(current);

  // Merge an undersized trailing chunk into its predecessor rather than
  // storing a fragment too small to carry useful meaning.
  if (chunks.length > 1) {
    const lastIndex = chunks.length - 1;
    if (countTokens(chunks[lastIndex]) < MIN_CHUNK_TOKENS) {
      chunks[lastIndex - 1] = `${chunks[lastIndex - 1]}\n\n${chunks[lastIndex]}`;
      chunks.pop();
    }
  }

  return chunks.map((content, index) => ({
    index,
    content,
    tokenCount: countTokens(content),
  }));
}
