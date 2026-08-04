import { describe, expect, it } from "vitest";
import { countTokens } from "gpt-tokenizer";
import { chunkText } from "@/lib/ingestion/chunk";

function paragraph(sentenceCount: number, seed: string): string {
  return Array.from({ length: sentenceCount }, (_, i) => `${seed} 문장 번호 ${i}는 테스트를 위한 내용입니다.`).join(
    " "
  );
}

describe("chunkText", () => {
  it("returns an empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as a single chunk", () => {
    const text = "짧은 문서입니다.\n\n두 번째 문단입니다.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].tokenCount).toBe(countTokens(chunks[0].content));
  });

  it("splits a long document into multiple chunks near the 800-1200 token target", () => {
    // Build ~4000 tokens of paragraphs so it must split into several chunks.
    const paragraphs = Array.from({ length: 12 }, (_, i) => paragraph(20, `단락${i}`));
    const text = paragraphs.join("\n\n");
    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    // every chunk except possibly the last should be within (or reasonably
    // near) the target band -- allow slack since we merge on paragraph
    // boundaries, not mid-sentence.
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(1200 + 200);
    }
  });

  it("assigns sequential zero-based indexes", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => paragraph(20, `단락${i}`));
    const chunks = chunkText(paragraphs.join("\n\n"));
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("does not produce a tiny trailing fragment when a long document is chunked", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => paragraph(20, `단락${i}`));
    const chunks = chunkText(paragraphs.join("\n\n"));
    const last = chunks[chunks.length - 1];
    if (chunks.length > 1) {
      expect(last.tokenCount).toBeGreaterThanOrEqual(100);
    }
  });
});
