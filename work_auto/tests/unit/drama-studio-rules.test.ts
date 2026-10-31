import { describe, expect, it } from "vitest";
import { VIDEO_MODELS, buildVideoInput, estimateVideoCredits, hasConflictingInputs, multiSceneCaveat, validateVideo, type VideoOptions } from "@/lib/drama-studio/models";
import { framePrompt, klingName, shotPrompts, videoPrompt } from "@/lib/drama-studio/prompts";
import { canEnter, emptyProject, emptyScene, markEdited, startAt } from "@/lib/drama-studio/steps";
import type { DramaCharacter } from "@/lib/drama-studio/types";

/** AI 드라마 스튜디오 (v0.9.81) — 모델 규칙·요청 형식·프롬프트·단계 규칙 (외부 호출 없음) */
const opt = (o: Partial<VideoOptions> = {}): VideoOptions => ({ modelId: "seedance-2-fast", mode: "first_frame", durationSec: 5, resolution: "720p", aspect: "9:16", audio: true, ...o });
const char = (id: string, name: string): DramaCharacter => ({ id, name, role: "주인공", age: "20대", gender: "여성", appearance: "단발", appearanceEn: "Korean woman, short black bob", outfit: "트렌치코트", personality: "", desire: "", weakness: "", secret: "", conflict: "", relations: [], arc: "", speech: "" });

describe("영상 모델 규칙", () => {
  it("Seedance 2.0 Fast 는 4~15초 — 20초 단일 요청은 막는다", () => {
    expect(validateVideo(opt({ durationSec: 5 }), { first: true, references: 0, scenes: 1 })).toEqual([]);
    expect(validateVideo(opt({ durationSec: 20 }), { first: true, references: 0, scenes: 1 })[0]).toContain("4~15초");
    expect(validateVideo(opt({ modelId: "seedance-2-5", durationSec: 20 }), { first: true, references: 0, scenes: 1 })).toEqual([]);
  });
  it("첫 프레임이 없으면, 끝 프레임이 없으면, 참고 이미지가 없으면 막는다", () => {
    expect(validateVideo(opt(), { first: false, references: 0, scenes: 1 }).join()).toContain("첫 프레임");
    expect(validateVideo(opt({ mode: "first_last" }), { first: true, last: false, references: 0, scenes: 1 }).join()).toContain("끝 프레임");
    expect(validateVideo(opt({ mode: "reference" }), { references: 0, scenes: 1 }).join()).toContain("참고 이미지");
    expect(validateVideo(opt({ mode: "reference" }), { references: 10, scenes: 1 }).join()).toContain("최대 9장");
  });
  it("MiniMax H3 는 참고 이미지 방식만, Kling 3.0 만 멀티 샷", () => {
    expect(validateVideo(opt({ modelId: "minimax-h3", mode: "first_frame", resolution: "768P" }), { first: true, references: 0, scenes: 1 }).join()).toContain("지원하지 않습니다");
    expect(validateVideo(opt({ mode: "multi_shot", shotSecs: [3, 3] }), { references: 0, scenes: 2 }).join()).toContain("지원하지 않습니다");
    expect(validateVideo(opt({ modelId: "kling-3", mode: "multi_shot", resolution: "std", shotSecs: [3, 4, 3] }), { first: true, references: 0, scenes: 3 })).toEqual([]);
    expect(validateVideo(opt({ modelId: "kling-3", mode: "multi_shot", resolution: "std", shotSecs: [3, 3, 3, 3, 3, 3] }), { first: true, references: 0, scenes: 6 }).join()).toContain("최대 5장면");
    expect(validateVideo(opt({ modelId: "kling-3", mode: "multi_shot", resolution: "std", shotSecs: [10, 10] }), { first: true, references: 0, scenes: 2 }).join()).toContain("3~15초");
  });
  it("여러 장면을 '첫 프레임' 하나로 묶을 수 없고, 참고 이미지 묶음은 순서 보장 안 함 안내", () => {
    expect(validateVideo(opt(), { first: true, references: 0, scenes: 3 }).join()).toContain("멀티 샷");
    expect(multiSceneCaveat(opt({ mode: "reference" }), 3)).toContain("보장하지 않습니다");
    expect(multiSceneCaveat(opt({ modelId: "kling-3", mode: "multi_shot" }), 3)).toBeNull();
  });
  it("요청 input: 방식마다 한 가지 입력만 (첫·끝 프레임과 참고 이미지를 함께 보내지 않음)", () => {
    for (const m of VIDEO_MODELS) {
      for (const mode of m.modes) {
        const o = opt({ modelId: m.id, mode, resolution: m.defaultResolution, durationSec: m.minSec + 1, shotSecs: mode === "multi_shot" ? [3, 3] : undefined });
        const input = buildVideoInput(o, { prompt: "test prompt", firstUrl: "https://x/1.png", lastUrl: "https://x/2.png", referenceUrls: ["https://x/a.png", "https://x/b.png"], shots: [{ prompt: "a", durationSec: 3 }, { prompt: "b", durationSec: 3 }], elements: [{ name: "charabc", description: "d", urls: ["https://x/a.png", "https://x/b.png"] }] });
        expect(hasConflictingInputs(input), `${m.id} ${mode}`).toBe(false);
      }
    }
    const fast = buildVideoInput(opt({ mode: "reference" }), { prompt: "p", firstUrl: "https://x/1.png", referenceUrls: ["https://x/a.png"] });
    expect(fast).toEqual({ prompt: "p", resolution: "720p", aspect_ratio: "9:16", duration: 5, generate_audio: true, reference_image_urls: ["https://x/a.png"] });
    const ff = buildVideoInput(opt(), { prompt: "p", firstUrl: "https://x/1.png", referenceUrls: ["https://x/a.png"] });
    expect(ff.first_frame_url).toBe("https://x/1.png");
    expect("reference_image_urls" in ff).toBe(false);
    const ms = buildVideoInput(opt({ modelId: "kling-3", mode: "multi_shot", resolution: "std", shotSecs: [3, 4] }), { prompt: "", firstUrl: "https://x/1.png", shots: [{ prompt: "a", durationSec: 3 }, { prompt: "b", durationSec: 4 }] });
    expect(ms).toMatchObject({ multi_shots: true, duration: "7", image_urls: ["https://x/1.png"], multi_prompt: [{ prompt: "a", duration: 3 }, { prompt: "b", duration: 4 }] });
    expect(hasConflictingInputs({ first_frame_url: "a", reference_image_urls: ["b"] })).toBe(true);
  });
  it("최소 예상 크레딧 = 공개 최소 단가 × 길이, 가격이 없으면 null", () => {
    expect(estimateVideoCredits(opt({ durationSec: 5 }))).toBe(34);
    expect(estimateVideoCredits(opt({ modelId: "minimax-h3", mode: "reference", resolution: "768P" }))).toBeNull();
  });
});

describe("프롬프트", () => {
  const cast = [char("c_aaa111", "서윤"), char("c_bbb222", "도현")];
  const scene = emptyScene({ title: "문자", characterIds: ["c_aaa111"], action: "휴대폰을 본다", dialogue: "서윤: 이게 왜 지금 와?", camera: "클로즈업" });
  it("스토리보드: 콜라주 금지 + 참고 이미지 번호로 인물 연결 (@Image 문법은 쓰지 않음)", () => {
    const t = framePrompt(scene, cast, "9:16", [cast[0]]);
    expect(t).toContain("not a collage");
    expect(t).toContain("서윤 = the person in reference image 1");
    expect(t).not.toMatch(/@Image/i);
  });
  it("Kling 참고(인물 요소)는 @요소이름, Seedance 는 글로 설명", () => {
    const k = videoPrompt([scene], cast, opt({ modelId: "kling-3", mode: "reference", resolution: "std" }), [cast[0]]);
    expect(k).toContain(`@${klingName(cast[0])}`);
    const s = videoPrompt([scene], cast, opt({ mode: "reference" }), [cast[0]]);
    expect(s).toContain("reference image 1");
    expect(s).not.toContain("@");
    expect(s).toContain('says in Korean: "이게 왜 지금 와?"');
  });
  it("묶음: 장면 순서대로 Shot 1·2…, 멀티 샷 컷 프롬프트는 500자 이내", () => {
    const two = [scene, emptyScene({ title: "카페", action: "커피를 마신다" })];
    const t = videoPrompt(two, cast, opt({ mode: "reference" }), []);
    expect(t).toContain("2 consecutive shots in this exact order");
    expect(t.indexOf("Shot 1")).toBeLessThan(t.indexOf("Shot 2"));
    for (const s of shotPrompts(two, cast, opt({ modelId: "kling-3", mode: "multi_shot", shotSecs: [3, 4] }))) expect(s.prompt.length).toBeLessThanOrEqual(500);
  });
  it("v0.9.99: 인물 위치 고정 + 스토리보드는 대표 한순간만, 영상은 동작 순서", () => {
    const two = emptyScene({ title: "소파", characterIds: ["c_aaa111", "c_bbb222"], action: "친구들이 다가온다 → 고개를 끄덕인다 → 일어난다", dialogue: "도현: 가자" });
    const f = framePrompt(two, cast, "9:16", []);
    expect(f).toContain("Exactly 2 people");
    expect(f).toContain("서윤 — frame left");
    expect(f).toContain("도현 — frame right");
    expect(f).toContain("[KEY MOMENT]");
    expect(f).toContain("일어난다");
    expect(f).not.toContain("고개를 끄덕인다");
    expect(f).toContain("never swap identities");
    const en = { subject: "", action: "", environment: "", camera: "", lighting: "", color: "", keyMoment: "도현 rises from the sofa", motion: "1) 도현 nods 2) 도현 stands up", blocking: [{ name: "도현", position: "frame left, on the sofa", pose: "sitting", cue: "grey hoodie" }, { name: "서윤", position: "frame right, by the door", pose: "standing", cue: "beige coat" }] };
    const v = videoPrompt([{ ...two, en }], cast, opt({ mode: "first_frame" }));
    expect(v).toContain("도현 — frame left, on the sofa, sitting (recognizable by: grey hoodie)");
    expect(v).toContain("[ACTION] In this order: 1) 도현 nods");
    expect(v).toContain("[END ON] 도현 rises from the sofa");
    expect(v).toContain('도현 (frame left, on the sofa) says in Korean: "가자"');
    expect(framePrompt({ ...two, en }, cast, "9:16", [])).toContain("[KEY MOMENT] 도현 rises from the sofa — show only this single frozen instant");
  });
  it("직접 고친 프롬프트가 있으면 그대로", () => {
    expect(videoPrompt([{ ...scene, videoPrompt: "MY PROMPT" }], cast, opt())).toBe("MY PROMPT");
  });
});

describe("단계 규칙", () => {
  it("앞 단계를 승인하지 않으면 다음 단계에 들어갈 수 없다", () => {
    const p = emptyProject("dp_test01", "t", new Date().toISOString());
    expect(canEnter(p, "select")).toBe(false);
    p.steps.ideas = { status: "approved", version: 1, approvedAt: "x" };
    expect(canEnter(p, "select")).toBe(true);
    expect(canEnter(p, "story")).toBe(false);
  });
  it("승인한 단계를 고치면 뒤 단계는 지우지 않고 '재검토 필요'", () => {
    const p = emptyProject("dp_test02", "t", "x");
    for (const k of ["ideas", "select", "story", "characters"] as const) p.steps[k] = { status: "approved", version: 1, approvedAt: "x" };
    p.characters = [char("c_aaa111", "서윤")];
    markEdited(p, "select");
    expect(p.steps.select.status).toBe("draft");
    expect(p.steps.story.status).toBe("review");
    expect(p.steps.characters.status).toBe("review");
    expect(p.characters).toHaveLength(1);
    // 고치는 중이어도 뒤 단계로 갈 수 있다 (한 번 승인했으니)
    expect(canEnter(p, "sheets")).toBe(true);
  });
  it("중간부터 시작: 앞 단계는 건너뜀", () => {
    const p = startAt(emptyProject("dp_test03", "t", "x"), "storyboard");
    expect(p.steps.scenario.status).toBe("skipped");
    expect(canEnter(p, "storyboard")).toBe(true);
    expect(canEnter(p, "video")).toBe(false);
  });
});
