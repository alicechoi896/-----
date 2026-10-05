import { describe, expect, it } from "vitest";
import { mergeFormatPersuasion } from "@/lib/server/ai/context-builder";
import { chooseScriptFormat } from "@/lib/server/services/script-formats";
import type { ScriptFormat, UserStyle } from "@/lib/types";

/** Hook·CTA·제목 패턴: 대본 포맷 → 스타일 순서 (v0.9.37) */
const style = { id: "s", name: "스타일", hooks: ["스타일 Hook"], ctas: ["스타일 CTA"], titlePatterns: ["스타일 제목"], preferredTypes: { hooks: ["question"] }, rules: [], examplePhrases: [], bannedPhrases: [], channelIds: [], tone: "", description: "" } as unknown as UserStyle;
const fmt = (p: Partial<ScriptFormat>): ScriptFormat => ({ id: "f", userId: "u", name: "포맷", contentType: "product", channelIds: [], examples: [], guideline: "", isDefault: true, createdAt: "", updatedAt: "", hooks: [], ctas: [], titlePatterns: [], preferredTypes: {}, badExamples: [], ...p });

describe("대본 포맷의 설득 구조가 먼저", () => {
  it("포맷에 있는 항목만 덮고, 없는 항목은 스타일 것", () => {
    const m = mergeFormatPersuasion(style, fmt({ hooks: ["포맷 Hook"], preferredTypes: { ctas: ["benefit"] } }))!;
    expect(m.hooks).toEqual(["포맷 Hook"]);
    expect(m.ctas).toEqual(["스타일 CTA"]);
    expect(m.titlePatterns).toEqual(["스타일 제목"]);
    expect(m.preferredTypes).toMatchObject({ hooks: ["question"], ctas: ["benefit"] });
  });
  it("포맷이 비어 있으면 스타일 그대로 (같은 객체 → 예전과 똑같이 동작)", () => {
    expect(mergeFormatPersuasion(style, fmt({}))).toBe(style);
    expect(mergeFormatPersuasion(style, null)).toBe(style);
  });
  it("스타일이 없어도 포맷의 Hook·CTA 는 쓴다", () => {
    const m = mergeFormatPersuasion(null, fmt({ ctas: ["포맷 CTA"] }))!;
    expect(m.ctas).toEqual(["포맷 CTA"]);
    expect(m.rules).toEqual([]);
  });
  it("블로그: 블로그 채널을 직접 고른 기본 포맷이 '모든 채널' 포맷보다 먼저", () => {
    const all = fmt({ id: "all", channelIds: [] });
    const blog = fmt({ id: "blog", channelIds: ["naver-blog"] });
    const video = fmt({ id: "video", channelIds: ["youtube"] });
    expect(chooseScriptFormat([all, blog, video], "product", "naver-blog", "", null)?.id).toBe("blog");
    expect(chooseScriptFormat([all, blog, video], "product", "youtube", "", null)?.id).toBe("video");
    expect(chooseScriptFormat([all, blog], "product", "naver-clip", "", null)?.id).toBe("all");
  });
});

describe("대본 포맷 여러 개 (v0.9.39)", async () => {
  const { chooseScriptFormats } = await import("@/lib/server/services/script-formats");
  it("스타일에 고른 포맷 2개 → 하나로 합친 가상 포맷 (가이드라인 번호, Hook 합치기)", () => {
    const a = fmt({ id: "a", name: "후회형", guideline: "A 구조", hooks: ["h1"], isDefault: false });
    const b = fmt({ id: "b", name: "비교형", guideline: "B 구조", hooks: ["h1", "h2"], isDefault: false });
    const m = chooseScriptFormats([a, b], "product", "youtube", "", { productFormatIds: ["a", "b"] })!;
    expect(m.name).toBe("후회형 · 비교형");
    expect(m.guideline).toContain("돌아가며 따른다");
    expect(m.guideline).toContain("[포맷 1: 후회형]");
    expect(m.hooks).toEqual(["h1", "h2"]);
    // 하나면 그대로, 없으면 기본 포맷
    expect(chooseScriptFormats([a, b], "product", "youtube", "", { productFormatIds: ["b"] })?.id).toBe("b");
    const def = fmt({ id: "d", isDefault: true });
    expect(chooseScriptFormats([a, def], "product", "youtube", "", { productFormatIds: [] })?.id).toBe("d");
  });
});
