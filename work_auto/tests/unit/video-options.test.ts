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
    expect(cleanTitleStyle({ font: "jua", line1: "#ffffff", line2: "#ffe94d", bar: "none" })).toEqual({ font: "jua", line1: "#FFFFFF", line2: "#FFE94D", bar: "none" });
    expect(cleanTitleStyle({ font: "x", line1: "red", bar: "javascript:" })).toEqual({ font: "dohyeon", line1: "#FFFFFF", line2: "#C8FF00", bar: "#000000" });
  });
  it("자막 세로 위치: 기본은 가운데보다 살짝 아래(62%)", () => {
    expect(captionCenterY(cleanCaptionStyle({}))).toBe(0.62);
    expect(captionCenterY(cleanCaptionStyle({ position: "center" }))).toBe(0.5);
  });
});
