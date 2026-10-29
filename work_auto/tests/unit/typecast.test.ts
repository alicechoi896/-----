import { afterEach, describe, expect, it, vi } from "vitest";
const { TypecastTTSProvider } = await import("@/lib/server/providers/tts/typecast");

afterEach(() => vi.unstubAllGlobals());

describe("타입캐스트 음성 (v0.9.73)", () => {
  it("음성 요청: X-API-KEY, ssfm-v30, kor, 감정 preset, mp3", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const buf = await new TypecastTTSProvider("KEY").synthesize("안녕하세요", "tc_60e5426de8b95f1d3000d7b5", undefined, { emotion: "toneup" });
    expect(buf.length).toBe(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.typecast.ai/v1/text-to-speech");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("KEY");
    expect(JSON.parse(String(init.body))).toEqual({
      voice_id: "tc_60e5426de8b95f1d3000d7b5",
      text: "안녕하세요",
      model: "ssfm-v30",
      language: "kor",
      prompt: { emotion_type: "preset", emotion_preset: "toneup", emotion_intensity: 1 },
      output: { audio_format: "mp3" },
    });
  });
  it("목소리 ID 가 아니면 부르지 않고, 402 는 크레딧 안내", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 402 }));
    vi.stubGlobal("fetch", fetchMock);
    const p = new TypecastTTSProvider("KEY");
    await expect(p.synthesize("a", "onyx")).rejects.toThrow("목소리");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(p.synthesize("a", "tc_60e5426de8b95f1d3000d7b5")).rejects.toThrow("크레딧");
  });
  it("목소리 목록: 한국어 이름·성별·샘플", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ voice_id: "tc_abcdef123456", voice_name: { eng: "Valkyrie", kor: "발키리" }, gender: "female", age: "young_adult", use_cases: ["Ads"], preview_url: "https://x/p.mp3", voice_type: "original", models: [{ version: "ssfm-v30", emotions: ["normal", "happy"] }] }]), { status: 200 })));
    const list = await new TypecastTTSProvider("KEY").listVoices();
    expect(list).toEqual([{ id: "tc_abcdef123456", name: "발키리", gender: "female", age: "young_adult", useCases: ["Ads"], previewUrl: "https://x/p.mp3", emotions: ["normal", "happy"], custom: false }]);
  });
});
