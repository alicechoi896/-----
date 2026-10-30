import { afterEach, describe, expect, it, vi } from "vitest";
const { OpenAIProvider } = await import("@/lib/server/providers/ai/openai-provider");

afterEach(() => vi.unstubAllGlobals());

/** v0.9.83: OpenAI json_object 모드는 메시지에 'json' 단어가 있어야 한다 (없으면 HTTP 400 — 드라마 스튜디오에서 났던 오류) */
describe("OpenAI JSON 응답", () => {
  it("메시지에 json 이 없으면 시스템 안내를 붙인다", async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"a":1}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new OpenAIProvider("KEY", "gpt-4o-mini").generateStructured({ task: "t", messages: [{ role: "user", content: "아이디어 20개" }], outputKeys: ["a"], variables: {} });
    expect(r.data).toEqual({ a: 1 });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body.messages)).toMatch(/json/i);
  });
  it("이미 json 이 있으면 그대로, 글 생성(generateText)에는 붙이지 않는다", async () => {
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: '{"a":1}' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const p = new OpenAIProvider("KEY", "gpt-4o-mini");
    await p.generateStructured({ task: "t", messages: [{ role: "user", content: "JSON 으로" }], outputKeys: ["a"], variables: {} });
    await p.generateText({ task: "t", messages: [{ role: "user", content: "안녕" }] });
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(bodies[0].messages).toHaveLength(1);
    expect(bodies[1].messages).toHaveLength(1);
  });
  it("400 이면 OpenAI 가 준 이유를 함께 보여 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "max_tokens is too large" } }, { status: 400 })));
    await expect(new OpenAIProvider("KEY", "gpt-4o-mini").generateText({ task: "t", messages: [{ role: "user", content: "x" }] })).rejects.toThrow("HTTP 400: max_tokens is too large");
  });
});
