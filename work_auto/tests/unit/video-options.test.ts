import { describe, expect, it } from "vitest";
const { cleanCaptionStyle, voiceInstructions, VOICE_OPTIONS, VOICE_STYLES } = await import("@/lib/video-production/config");
const { getGeneratorConfig } = await import("@/lib/generators/configs");
const { sanitizeClips, isKieFile } = await import("@/lib/server/video/ai-clips");

describe("영상 옵션 (v0.9.63)", () => {
  it("자막 스타일: 허용한 글꼴·#RRGGBB 색만, 테두리 없음 가능", () => {
    expect(cleanCaptionStyle({ font: "dohyeon", color: "#ffe94d", stroke: "none", size: "l" })).toEqual({ font: "dohyeon", color: "#FFE94D", stroke: "none", size: "l", position: "lower" });
    expect(cleanCaptionStyle({ font: "comic", color: "red", stroke: "url(x)", size: "xl" })).toEqual({ font: "jua", color: "#FFFFFF", stroke: "#000000", size: "m", position: "lower" });
  });
  it("목소리 13가지 · 말투마다 다른 지시", () => {
    expect(VOICE_OPTIONS.length).toBe(13);
    expect(new Set(VOICE_STYLES.map((v) => voiceInstructions(v.value))).size).toBe(VOICE_STYLES.length);
    expect(voiceInstructions("없는말투")).toBe(VOICE_STYLES[0].instructions);
  });
  it("제품 홍보 영상: 콘텐츠 스타일 기본 전체 선택 + 섬네일 제목 후보", () => {
    const c = getGeneratorConfig("yt-product-video")!;
    const style = c.fields.find((f) => f.name === "style")!;
    expect(style.defaultValue!.split(",")).toEqual(style.options!.map((o) => o.value));
    expect(c.outputs.some((o) => o.key === "thumbnailTitles")).toBe(true);
  });
  it("AI 컷: 직접 올린 사진(Kie 파일 주소)은 허용, 다른 주소는 버린다", () => {
    expect(isKieFile("https://tempfile.redpandaai.co/x/a.jpg")).toBe(true);
    expect(isKieFile("https://evil.com/a.jpg")).toBe(false);
    const out = sanitizeClips([{ id: "ai1", mode: "product", prompt: "x", imageUrl: "https://tempfile.redpandaai.co/a.jpg" }, { id: "ai2", mode: "product", prompt: "y", imageUrl: "https://evil.com/a.jpg" }], new Set());
    expect(out[0].imageUrl).toBe("https://tempfile.redpandaai.co/a.jpg");
    expect(out[1].imageUrl).toBeNull();
  });
});

describe("제목 스타일·자막 위치 (v0.9.64)", async () => {
  const { cleanTitleStyle, cleanCaptionStyle, captionCenterY } = await import("@/lib/video-production/config");
  it("제목: 글꼴·색 검사, 띠 없음 가능", () => {
    expect(cleanTitleStyle({ font: "jua", line1: "#ffffff", line2: "#ffe94d", bar: "none" })).toEqual({ font: "jua", line1: "#FFFFFF", line2: "#FFE94D", accent: "#FFE94D", bar: "none" });
    expect(cleanTitleStyle({ font: "x", line1: "red", bar: "javascript:" })).toEqual({ font: "dohyeon", line1: "#FFFFFF", line2: "#C8FF00", accent: "#FFE94D", bar: "#000000" });
  });
  it("자막 세로 위치: 기본은 가운데보다 살짝 아래(62%)", () => {
    expect(captionCenterY(cleanCaptionStyle({}))).toBe(0.62);
    expect(captionCenterY(cleanCaptionStyle({ position: "center" }))).toBe(0.5);
  });
});

describe("자막 1줄·제목 강조·음성 속도 (v0.9.66)", async () => {
  const { captionChunks, accentParts, atempoChain, cleanVoiceSpeed } = await import("@/lib/video-production/config");
  it("자막은 한 줄씩, 비슷한 길이로 띄어쓰기에서 나눈다", () => {
    expect(captionChunks("노이즈 캔슬링 헤드폰 오래 끼면 귀가 답답하죠", 14)).toEqual(["노이즈 캔슬링 헤드폰", "오래 끼면 귀가 답답하죠"]);
    expect(captionChunks("짧은 대사", 14)).toEqual(["짧은 대사"]);
    expect(captionChunks("가성비 끝판왕 무선 이어폰 진짜 좋아", 14)).toEqual(["가성비 끝판왕 무선", "이어폰 진짜 좋아"]);
  });
  it("제목 [ ] 는 강조색 조각", () => {
    expect(accentParts("소니 [WH-CH720N] 후기")).toEqual([
      { text: "소니 ", accent: false },
      { text: "WH-CH720N", accent: true },
      { text: " 후기", accent: false },
    ]);
  });
  it("음성 속도: 기본 2배, 허용 값만", () => {
    expect(atempoChain(undefined)).toBe(",atempo=2");
    expect(atempoChain(1)).toBe("");
    expect(cleanVoiceSpeed(9)).toBe(2);
  });
});

describe("영상 길이 맞추기 (v0.9.67)", async () => {
  const { fitTempo, atempoFor, targetFromLength } = await import("@/lib/video-production/config");
  it("목표 15초: 음성 28초면 약 2배, 짧으면 그대로, 최대 3배", () => {
    expect(fitTempo(28, 15, 1)).toBe(2);
    expect(fitTempo(8, 15, 1)).toBe(1);
    expect(fitTempo(80, 15, 1)).toBe(3);
    expect(fitTempo(28, 0, 1)).toBe(1);
  });
  it("v0.9.75: 고른 속도는 항상 쓰고, 목표보다 길 때만 더 빠르게", async () => {
    const { playTempo, DEFAULT_PAUSE } = await import("@/lib/video-production/config");
    expect(playTempo(8, 15, 1, 1.5)).toBe(1.5);
    expect(playTempo(28, 15, 1, 1.25)).toBe(2);
    expect(playTempo(28, 0, 1, 1.25)).toBe(1.25);
    expect(DEFAULT_PAUSE).toBe(0.1);
  });
  it("atempo 는 한 번에 최대 2배라 나눠 건다", () => {
    expect(atempoFor(3)).toBe("atempo=2,atempo=1.5000");
    expect(atempoFor(1)).toBe("");
  });
  it("대본 길이 → 기본 목표", () => {
    expect(targetFromLength("15s")).toBe(15);
    expect(targetFromLength("3m")).toBe(0);
  });
});
