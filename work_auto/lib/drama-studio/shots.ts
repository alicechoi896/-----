import { dialogueLines } from "@/lib/drama/prompt";
import { DEFAULT_SHOT_MODEL, videoModel, type VideoOptions } from "./models";
import { blockingOf, characterLine, isCharacter, klingName, sceneCast } from "./prompts";
import type { DramaCharacter, DramaImage, DramaProject, DramaScene, DramaShot, ShotKind } from "./types";

/**
 * v0.9.104 촬영 샷 (08 영상 제작). docs/DRAMA_STUDIO.md
 * 스토리보드 1장(장면)을 서로 다른 구도의 샷 1~4개로 나누고, 샷마다 기준 이미지 → 승인 → 시작 프레임으로 AI 영상.
 * 한 샷 = 한 가지 핵심 행동. 시작 프레임·시작+끝 프레임·참고 이미지는 섞지 않는다.
 */
export const SHOT_KINDS: { value: ShotKind; label: string; en: string }[] = [
  { value: "wide", label: "전체 샷", en: "wide establishing shot showing the whole space and everyone's positions" },
  { value: "closeup", label: "인물 클로즈업", en: "close-up on one character's face and shoulders" },
  { value: "dialogue", label: "대사 샷", en: "medium shot of the speaking character, mouth clearly visible" },
  { value: "reaction", label: "반응 샷", en: "close-up of the listening character's facial reaction" },
  { value: "insert", label: "손/소품 인서트", en: "tight insert shot of hands and the key prop" },
  { value: "action", label: "이동/액션 샷", en: "medium-wide shot following the character's movement" },
];
export const shotKindLabel = (k: ShotKind) => SHOT_KINDS.find((x) => x.value === k)?.label ?? k;
const kindEn = (k: ShotKind) => SHOT_KINDS.find((x) => x.value === k)?.en ?? "";

export const MAX_SHOTS_PER_SCENE = 6;

/**
 * v0.9.116 인물 목소리 기본 추천 (AI 호출 없이 성별·나이·말투로). 직접 쓴 값이 있으면 그것을 쓴다.
 * AI 영상 모델이 소리를 만들 때 프롬프트에 넣는다 — 모델이 클립마다 목소리를 새로 만들어 '완전히 같은 목소리'는 보장되지 않는다.
 */
export function recommendedVoice(c: Pick<DramaCharacter, "gender" | "age" | "personality" | "speech">): string {
  const g = /여|female|woman/i.test(c.gender ?? "") ? "female" : /남|male|man/i.test(c.gender ?? "") ? "male" : "";
  const n = Number((c.age ?? "").match(/\d+/)?.[0] ?? "");
  const age = n ? (n < 20 ? "teen" : `in ${g === "female" ? "her" : g === "male" ? "his" : "their"} ${Math.floor(n / 10) * 10}s`) : /10대/.test(c.age ?? "") ? "teen" : "";
  const t = `${c.personality ?? ""} ${c.speech ?? ""}`;
  const tone = /차분|침착|냉정|calm/.test(t) ? "calm, steady" : /밝|활발|명랑|cheer/.test(t) ? "bright, energetic" : /장난|유쾌/.test(t) ? "playful, light" : /무뚝뚝|퉁명|차갑/.test(t) ? "low, blunt" : /부드|다정|따뜻/.test(t) ? "soft, warm" : "natural, clear";
  return [tone, g ? `${g} voice` : "voice", age, "natural Korean speech"].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
export const voiceOf = (c: Pick<DramaCharacter, "voice" | "gender" | "age" | "personality" | "speech">) => c.voice?.trim() || recommendedVoice(c);
export const DEFAULT_SHOT_SEC = 5;

/** 장면의 샷 (순서대로) */
export const shotsOf = (p: Pick<DramaProject, "shots">, sceneId: string) => (p.shots ?? []).filter((s) => s.sceneId === sceneId).sort((a, b) => a.order - b.order);

/** 화면 표시 번호: Scene02-ShotA */
export function shotCode(p: Pick<DramaProject, "shots" | "scenario">, shot: Pick<DramaShot, "id" | "sceneId">): string {
  const n = p.scenario.scenes.findIndex((s) => s.id === shot.sceneId) + 1;
  const k = shotsOf(p, shot.sceneId).findIndex((s) => s.id === shot.id);
  return `Scene${String(Math.max(0, n)).padStart(2, "0")}-Shot${String.fromCharCode(65 + Math.max(0, k))}`;
}

export function emptyShot(sceneId: string, order: number, over: Partial<DramaShot> = {}): DramaShot {
  return {
    id: `sh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    sceneId,
    order,
    kind: "wide",
    title: "",
    action: "",
    camera: "",
    dialogue: "",
    characterIds: [],
    durationSec: DEFAULT_SHOT_SEC,
    modelId: DEFAULT_SHOT_MODEL,
    resolution: "720p",
    mode: "first_frame",
    continueFromPrev: false,
    audio: true,
    voiceSource: "ai",
    voiceKey: null,
    approved: false,
    images: [],
    createdAt: new Date().toISOString(),
    ...over,
  };
}

export const approvedShotImage = (s: DramaShot): DramaImage | null => s.images.find((i) => i.approved && !i.removed) ?? null;
/** 같은 장면 바로 앞 샷 */
export const prevShot = (p: Pick<DramaProject, "shots">, s: DramaShot) => shotsOf(p, s.sceneId).filter((x) => x.order < s.order).pop() ?? null;
export const nextShot = (p: Pick<DramaProject, "shots">, s: DramaShot) => shotsOf(p, s.sceneId).find((x) => x.order > s.order) ?? null;

/** 이 샷 인물 (고른 인물 + 대사·행동에 이름이 나오는 인물) */
export function shotCast(p: Pick<DramaProject, "characters">, scene: DramaScene, shot: DramaShot): DramaCharacter[] {
  const picked = shot.characterIds.map((id) => p.characters.find((c) => c.id === id)).filter((c): c is DramaCharacter => Boolean(c));
  if (picked.length) return picked;
  return sceneCast({ ...scene, dialogue: shot.dialogue || scene.dialogue, action: `${shot.title} ${shot.action}` }, p.characters);
}

const CONSTRAINTS = "No subtitles, no on-screen text, no watermark, no logo. Photorealistic, natural skin texture.";
const LOCK = "Each person keeps their own face, hairstyle, skin tone and outfit exactly as in their reference — never swap identities or positions, never merge two people, no extra people.";

/**
 * 샷 기준 이미지 (Nano Banana Edit). 참고 이미지 순서: 인물 기준 이미지(인물마다 1장) → 마지막 1장 = 장면 스토리보드(배경·위치·조명 기준)
 * refChars = 실제로 넣는 인물 (순서대로 reference image 1…), hasStoryboard = 스토리보드 이미지를 마지막에 넣는가
 */
export function shotImagePrompt(p: DramaProject, scene: DramaScene, shot: DramaShot, refChars: DramaCharacter[], hasStoryboard: boolean, aspect: string): string {
  const cast = shotCast(p, scene, shot);
  const blocks = blockingOf(scene, cast);
  const sb = refChars.length + 1;
  return [
    `[FORMAT] Single film still for a Korean live-action short drama, ${aspect} ${aspect === "9:16" ? "vertical" : "horizontal"}, one moment only (not a collage, no panels).`,
    refChars.length ? `[REFERENCES] ${refChars.map((c, i) => `${c.name} = the person in reference image ${i + 1}`).join("; ")}. Draw these SAME people: identical face shape, eyes, nose, lips, skin tone, age, hairstyle and outfit — do not redesign or beautify.` : "",
    hasStoryboard ? `[CONTINUITY] Reference image ${sb} is the storyboard of this scene: keep the SAME location, set dressing, props, lighting, time of day, outfits and who stands where. Only the camera framing changes for this shot.` : "",
    `[SHOT] ${kindEn(shot.kind)}. ${shot.camera ? `Framing: ${shot.camera}.` : ""}`,
    cast.length ? `[SUBJECT] Exactly ${cast.length} ${cast.length === 1 ? "person" : "people"} in this shot${shot.kind === "insert" ? " (hands and the prop may fill the frame)" : ""}: ${cast.map((c) => `${c.name} (${characterLine(c)})`).join("; ")}.` : "",
    blocks.length > 1 ? `[BLOCKING] ${blocks.map((b) => `${b.name} — ${b.position}${b.pose ? `, ${b.pose}` : ""}`).join("; ")}.` : "",
    `[KEY MOMENT] The starting moment of this shot: ${shot.action || shot.title || scene.action}. A single frozen instant, not a sequence.`,
    `[ENVIRONMENT] ${scene.en?.environment || [scene.location, scene.timeOfDay].filter(Boolean).join(", ")}`,
    scene.en?.lighting ? `[LIGHTING] ${scene.en.lighting}` : "",
    `[CONSTRAINTS] ${cast.length ? LOCK + " " : ""}${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 대사 말하는 속도 (한국어 약 6글자/초) → 이 길이에 다 말할 수 있나 */
export function dialogueFit(shot: Pick<DramaShot, "dialogue" | "durationSec">): { needSec: number; ok: boolean } {
  const chars = dialogueLines(shot.dialogue, 10).reduce((n, d) => n + d.line.replace(/\s/g, "").length, 0);
  const needSec = Math.round((chars / 6 + 0.6) * 10) / 10;
  return { needSec: chars ? needSec : 0, ok: !chars || needSec <= shot.durationSec * 0.9 };
}

/** 샷 영상 프롬프트: 한 샷의 핵심 행동 하나 + 카메라 + 대사(목소리) + 일관성 */
export function shotVideoPrompt(p: DramaProject, scene: DramaScene, shot: DramaShot, o: VideoOptions, refChars: DramaCharacter[], chained: boolean): string {
  const m = videoModel(o.modelId);
  const kling = m?.family === "kling";
  const cast = shotCast(p, scene, shot);
  const who = (c: DramaCharacter) => (kling && o.mode === "reference" ? `@${klingName(c)}` : c.name);
  const blocks = blockingOf(scene, cast);
  const lines = shot.voiceSource === "ai" && o.audio
    ? dialogueLines(shot.dialogue, 4).map((d) => {
        const c = cast.find((x) => isCharacter(x, d.speaker)) ?? p.characters.find((x) => isCharacter(x, d.speaker));
        const b = c ? blocks.find((x) => x.name === c.name) : null;
        return `${c ? who(c) : d.speaker}${b && blocks.length > 1 ? ` (${b.position})` : ""}${c ? ` [voice: ${voiceOf(c)}]` : ""} says in Korean: "${d.line}"`;
      })
    : [];
  const refs =
    o.mode === "reference"
      ? kling
        ? `[REFERENCES] ${refChars.map((c) => `${c.name} is @${klingName(c)}`).join("; ")}. Keep faces, hairstyles and outfits identical.`
        : `[REFERENCES] Reference image 1 is the approved frame of this shot (location, framing, outfits). ${refChars.map((c, i) => `${c.name} = the person in reference image ${i + 2}`).join("; ")}. Keep faces, hairstyles and outfits identical.`
      : chained
        ? "[REFERENCES] The first frame is the last frame of the previous shot: continue the same action seamlessly from it. Keep EXACTLY the same faces, hairstyles, outfits, positions and background."
        : `[REFERENCES] Start exactly from the provided first frame. Every character keeps EXACTLY the same face, hairstyle, skin tone and outfit as in the first frame for the whole clip — never morph or replace a face.${o.mode === "first_last" ? " End exactly on the provided last frame." : ""}`;
  return [
    `[FORMAT] Korean live-action short drama, ${o.aspect} ${o.aspect === "9:16" ? "vertical" : "horizontal"}, cinematic, realistic, ${o.durationSec} seconds.`,
    refs,
    `[SHOT] One continuous shot, no cuts, no scene change, no time jump. ${kindEn(shot.kind)}.`,
    blocks.length ? `[BLOCKING] ${blocks.map((b) => `${who(cast.find((c) => c.name === b.name) ?? ({ name: b.name } as DramaCharacter))} — ${b.position}`).join("; ")}. Nobody changes sides.` : "",
    `[ACTION] ${shot.action || shot.title || scene.action} Show this one action clearly from start to finish at a natural pace; do not add other actions.`,
    shot.camera ? `[CAMERA] ${shot.camera}` : "",
    lines.length ? `[DIALOGUE] ${lines.join(" ")} (natural Korean speech with matching lip movement, finish the line within the clip)` : o.audio ? "[SOUND] Natural ambient sound and subtle effects only, no speech." : "",
    `[ENVIRONMENT] ${scene.en?.environment || [scene.location, scene.timeOfDay].filter(Boolean).join(", ")}`,
    `[CONSTRAINTS] Same characters with identical faces, hairstyles and outfits in every frame. ${LOCK} ${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, kling ? 2500 : 6000);
}

export interface ShotCostLine {
  modelId: string;
  label: string;
  shots: number;
  seconds: number;
  credits: number | null;
}

/** 전체 생성 전 확인: 모델별 샷 수·초·예상 크레딧 */
export function shotCostSummary(shots: Pick<DramaShot, "modelId" | "durationSec" | "resolution">[]): { lines: ShotCostLine[]; shots: number; seconds: number; credits: number; unknown: boolean } {
  const by = new Map<string, ShotCostLine>();
  for (const s of shots) {
    const m = videoModel(s.modelId);
    const line = by.get(s.modelId) ?? { modelId: s.modelId, label: m?.label ?? s.modelId, shots: 0, seconds: 0, credits: 0 };
    const per = m?.creditsPerSecByRes?.[s.resolution] ?? m?.minCreditsPerSec ?? null;
    line.shots += 1;
    line.seconds += s.durationSec;
    line.credits = per === null || line.credits === null ? null : Math.round(line.credits + per * s.durationSec);
    by.set(s.modelId, line);
  }
  const lines = [...by.values()];
  return { lines, shots: shots.length, seconds: lines.reduce((n, l) => n + l.seconds, 0), credits: lines.reduce((n, l) => n + (l.credits ?? 0), 0), unknown: lines.some((l) => l.credits === null) };
}
