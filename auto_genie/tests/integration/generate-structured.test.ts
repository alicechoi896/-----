import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const generateObjectMock = vi.fn();
vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

const { generateStructured, StructuredGenerationError } = await import("@/lib/ai/generate-structured");

const schema = z.object({ ok: z.boolean() });

describe("generateStructured", () => {
  beforeEach(() => generateObjectMock.mockReset());

  it("returns the object on first success without retrying", async () => {
    generateObjectMock.mockResolvedValueOnce({ object: { ok: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateStructured({ model: {} as any, schema, system: "s", prompt: "p" });
    expect(result).toEqual({ ok: true });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once after a schema-invalid response, then succeeds", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("invalid schema")).mockResolvedValueOnce({ object: { ok: true } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateStructured({ model: {} as any, schema, system: "s", prompt: "p" });
    expect(result).toEqual({ ok: true });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
    // the retry prompt should include a correction hint appended to the original prompt
    const secondCallArgs = generateObjectMock.mock.calls[1][0] as { prompt: string };
    expect(secondCallArgs.prompt).toContain("p");
    expect(secondCallArgs.prompt.length).toBeGreaterThan("p".length);
  });

  it("throws StructuredGenerationError after two consecutive failures, never a fabricated fallback", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("still invalid")).mockRejectedValueOnce(new Error("still invalid"));
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generateStructured({ model: {} as any, schema, system: "s", prompt: "p" })
    ).rejects.toBeInstanceOf(StructuredGenerationError);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
