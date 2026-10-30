import { describe, expect, it, vi, afterEach } from "vitest";
import { groupLines, splitByChars, splitBySilence } from "@/lib/video-production/voice-split";
const { TypecastTTSProvider } = await import("@/lib/server/providers/tts/typecast");

afterEach(() => vi.unstubAllGlobals());

const timed = (text: string, from: number, per = 0.1) => [...text].map((c, i) => ({ text: c, start: from + i * per, end: from + (i + 1) * per }));

describe("대본 전체 음성 → 줄마다 자르기 (v0.9.77)", () => {
  it("글자 시각으로 줄 경계 (공백·줄바꿈 무시, 경계는 쉼 가운데)", () => {
    const chars = [...timed("아직도요?", 0), { text: "\n", start: 0.5, end: 0.5 }, ...timed("이거 하나", 0.9)];
    const spans = splitByChars(["아직도요?", "이거 하나"], chars, 1.5);
    expect(spans).toEqual([[0, 0.7], [0.7, 1.5]]);
  });
  it("시간표 글자가 대본과 다르면 null", () => {
    expect(splitByChars(["가나", "다라"], timed("가나다", 0), 1)).toBeNull();
  });
  it("예비: 글자 수 비율 근처의 쉼에서 자른다", () => {
    const spans = splitBySilence(["가나다라", "마바사아"], [[0.9, 1.1], [1.6, 1.7]], 2);
    expect(spans[0][1]).toBeCloseTo(1, 3);
    expect(spans[1]).toEqual([1, 2]);
  });
  it("2000자 안에서 묶기", () => {
    expect(groupLines(["a".repeat(1000), "b".repeat(1000), "c"])).toEqual([[0], [1, 2]]);
  });
  it("타입캐스트 시간표 음성: 한 번 호출, base64 음성 + 글자 시각", async () => {
    const fetchMock = vi.fn(async () => Response.json({ audio: Buffer.from([1, 2]).toString("base64"), audio_format: "mp3", characters: [{ text: "가", start: 0, end: 0.2 }], audio_duration: 0.3 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await new TypecastTTSProvider("KEY").synthesizeWithTimestamps("가\n나", "tc_60e5426de8b95f1d3000d7b5");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe("https://api.typecast.ai/v1/text-to-speech/with-timestamps?granularity=char");
    expect(r.audio.length).toBe(2);
    expect(r.chars).toEqual([{ text: "가", start: 0, end: 0.2 }]);
    expect(r.duration).toBe(0.3);
  });
});
