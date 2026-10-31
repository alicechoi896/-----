import { dialogueLines } from "@/lib/drama/prompt";
import { videoModel, type VideoOptions } from "./models";
import type { Aspect, DramaCharacter, DramaScene, SceneBlocking, SheetKind } from "./types";

/**
 * 이미지·영상 영어 프롬프트 (v0.9.81). docs/DRAMA_STUDIO.md
 * 틀: [FORMAT] [REFERENCES] [SUBJECT] [BLOCKING] [KEY MOMENT 또는 ACTION] [ENVIRONMENT] [CAMERA] [LIGHTING] [COLOR & TEXTURE] [CONSTRAINTS]
 * v0.9.99: 인물마다 화면 위치·자세·구별 특징을 적고(인물 바꿔 잡기 방지), 스토리보드는 대표 한순간 하나만, 영상은 동작 순서대로
 * 참고 이미지 가리키기는 모델마다 다르다:
 * - Kling 3.0 인물 요소: 문서에 있는 @이름 문법 (kling_elements.name)
 * - Seedance·MiniMax·Nano Banana: 문서에 참조 문법(@Image1 등)이 없어 'reference image N' 처럼 글로 설명한다
 */
export const SHEET_KINDS: { kind: SheetKind; label: string; aspect: string; en: string }[] = [
  { kind: "front", label: "정면 얼굴", aspect: "3:4", en: "front-facing head-and-shoulders portrait, looking straight at the camera, neutral expression" },
  { kind: "side", label: "측면 얼굴", aspect: "3:4", en: "side profile head-and-shoulders portrait (90-degree profile), same person" },
  { kind: "full", label: "전신", aspect: "9:16", en: "full-body standing shot from head to toe, neutral pose, plain background" },
  { kind: "expression", label: "대표 표정", aspect: "3:4", en: "close-up portrait showing the character's signature expression" },
  { kind: "outfit", label: "주요 의상", aspect: "9:16", en: "full-body shot clearly showing the main outfit details, front view" },
  { kind: "extra", label: "추가 포즈", aspect: "9:16", en: "additional pose of the same character" },
];
export const sheetMeta = (k: SheetKind) => SHEET_KINDS.find((s) => s.kind === k)!;

const CONSTRAINTS = "No subtitles, no on-screen text, no watermark, no logo. Photorealistic, natural skin texture.";

/** 이름 비교용: 괄호 속 설명·띄어쓰기 빼기 ('지니 (램프의 요정)' → '지니') */
export const nameKey = (n: string) => n.replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+/g, "").trim();
export const sameName = (a: string, b: string) => {
  const x = nameKey(a);
  const y = nameKey(b);
  return Boolean(x && y) && (x === y || (y.length >= 2 && x.includes(y)) || (x.length >= 2 && y.includes(x)));
};

/**
 * v0.9.100: 장면에 나오는 인물. 고른 인물(characterIds) + 행동·대사·화면 설명·영어 조각에 이름이 나오는 인물.
 * 등장인물 칸에서 빠지면 기준 이미지·외모 설명이 안 가서 얼굴·성별이 바뀌던 문제 (예: 지니가 여자로)
 */
/** 이 인물의 이름 + 다른 호칭 */
export const namesOf = (c: Pick<DramaCharacter, "name" | "aliases">) => [c.name, ...(c.aliases ?? "").split(/[,，、/]/)].map((x) => x.trim()).filter(Boolean);
/** 글에 쓰인 이름(n)이 이 인물인가 (호칭 포함) */
export const isCharacter = (c: Pick<DramaCharacter, "name" | "aliases">, n: string) => namesOf(c).some((x) => sameName(x, n));

export function sceneCast(s: DramaScene, cast: DramaCharacter[]): DramaCharacter[] {
  const text = nameKey([s.title, s.action, s.dialogue, s.visual, s.en?.subject, s.en?.action, s.en?.keyMoment, s.en?.motion, ...(s.en?.blocking ?? []).map((b) => b.name)].filter(Boolean).join(" "));
  const picked = s.characterIds.map((id) => cast.find((c) => c.id === id)).filter((c): c is DramaCharacter => Boolean(c));
  const mentioned = cast.filter((c) => !picked.includes(c) && namesOf(c).some((n) => nameKey(n).length >= 2 && text.includes(nameKey(n))));
  return [...picked, ...mentioned];
}

const GENDER_EN: Record<string, string> = { 남성: "male", 남자: "male", 여성: "female", 여자: "female" };

export function characterLine(c: DramaCharacter): string {
  const looks = c.appearanceEn || c.appearance;
  // 성별·나이를 앞에 못 박는다 (외모 글에 없으면 모델이 성별을 바꿔 그림)
  const g = GENDER_EN[(c.gender ?? "").trim()] ?? (c.gender ?? "").trim();
  const head = [g && !new RegExp(`\\b(${g}|man|woman|boy|girl)\\b`, "i").test(looks) ? g : "", c.age ? `age ${c.age}` : ""].filter(Boolean).join(", ");
  return [head, looks, c.outfit && !c.appearanceEn ? `wearing ${c.outfit}` : ""].filter(Boolean).join(", ");
}

/** 캐릭터 시트 이미지 프롬프트. hasReference = 기준 이미지를 참고로 넣었는가 */
export function sheetPrompt(c: DramaCharacter, kind: SheetKind, hasReference: boolean, styleNote = ""): string {
  const m = sheetMeta(kind);
  return [
    `[FORMAT] Character reference sheet image, ${m.aspect} portrait, Korean drama, cinematic realistic photo.`,
    hasReference
      ? "[REFERENCES] The reference image(s) show this exact person. Draw the SAME person: identical face shape, eyes, eyebrows, nose, lips, jawline, skin tone, age, hairstyle and hair color, and the same outfit. Only the camera angle, pose or expression changes — do not redesign the face."
      : "",
    `[SUBJECT] ${c.name}${c.age ? `, age ${c.age}` : ""}${c.gender ? `, ${c.gender}` : ""}: ${characterLine(c)}.`,
    `[ACTION] ${m.en}.`,
    "[ENVIRONMENT] Clean light-grey studio background.",
    "[LIGHTING] Soft even studio lighting.",
    styleNote ? `[COLOR & TEXTURE] ${styleNote}` : "[COLOR & TEXTURE] Natural colors, sharp focus.",
    `[CONSTRAINTS] Single person only. ${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 장면 영어 조각이 없을 때 한국어 내용을 그대로 쓴다 */
function sceneParts(s: DramaScene) {
  return {
    subject: s.en?.subject || s.visual,
    action: s.en?.action || s.action,
    environment: s.en?.environment || [s.location, s.timeOfDay].filter(Boolean).join(", "),
    camera: s.en?.camera || s.camera,
    lighting: s.en?.lighting || "",
    color: s.en?.color || "",
  };
}

const SIDES = [["frame center"], ["frame left", "frame right"], ["frame left", "frame center", "frame right"]];

/** 인물 배치: AI 가 만든 배치가 없으면 등장 순서대로 왼쪽→오른쪽 */
export function blockingOf(s: DramaScene, people: DramaCharacter[]): SceneBlocking[] {
  const given = s.en?.blocking ?? [];
  return people.map((c, k) => {
    const b = given.find((x) => isCharacter(c, x.name));
    return { name: c.name, position: b?.position || (SIDES[Math.min(people.length, 3) - 1]?.[k] ?? "background"), pose: b?.pose || "", cue: b?.cue || characterLine(c) };
  });
}

function blockingLine(list: SceneBlocking[], name: (n: string) => string, opening = false): string {
  if (!list.length) return "";
  const n = list.length;
  return `[BLOCKING] Exactly ${n} ${n === 1 ? "person" : "people"} in frame${opening ? " (opening positions, as in the first frame)" : ""}: ${list
    .map((b) => `${name(b.name)} — ${b.position}${b.pose ? `, ${b.pose}` : ""} (recognizable by: ${b.cue})`)
    .join("; ")}.`;
}

/** 한국어 행동에서 마지막 단계 (예: 'A → B → C' 의 C) */
const lastStep = (t: string) => t.split(/→|->|\n/).map((x) => x.trim()).filter(Boolean).pop() ?? t;

const NO_SWAP = "Each person stays in the stated position with their own face, hairstyle and outfit — never swap identities or positions between people, never merge two people into one, no duplicate of the same person, no extra people.";

/** 스토리보드 이미지 프롬프트. refs = 넣는 기준 이미지의 주인 (순서대로 reference image 1, 2…) */
export function framePrompt(s: DramaScene, cast: DramaCharacter[], aspect: Aspect, refs: DramaCharacter[]): string {
  if (s.imagePrompt.trim()) return s.imagePrompt.trim();
  const p = sceneParts(s);
  const people = sceneCast(s, cast);
  return [
    `[FORMAT] Single storyboard frame for a Korean live-action short drama, ${aspect} ${aspect === "9:16" ? "vertical" : "horizontal"}, cinematic still, one moment only (not a collage, no panels).`,
    refs.length ? `[REFERENCES] ${refs.map((c, i) => `${c.name} = the person in reference image ${i + 1}`).join("; ")}. Draw these SAME people: identical face shape, eyes, eyebrows, nose, lips, skin tone, age, hairstyle and outfit as their reference images — do not redesign or beautify the faces.` : "",
    `[SUBJECT] ${people.length ? people.map((c) => `${c.name} (${characterLine(c)})`).join("; ") + ". " : ""}${p.subject}`,
    blockingLine(blockingOf(s, people), (n) => n),
    s.en?.keyMoment
      ? `[KEY MOMENT] ${s.en.keyMoment} — show only this single frozen instant, not a sequence of actions.`
      : p.action
        ? `[KEY MOMENT] Show only the single decisive final instant of this action, frozen (not a sequence): ${s.en?.action ? p.action : lastStep(p.action)}`
        : "",
    p.environment ? `[ENVIRONMENT] ${p.environment}` : "",
    p.camera ? `[CAMERA] ${p.camera}` : "",
    p.lighting ? `[LIGHTING] ${p.lighting}` : "",
    p.color ? `[COLOR & TEXTURE] ${p.color}` : "",
    `[CONSTRAINTS] ${people.length ? NO_SWAP + " " : ""}${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kling 인물 요소 이름 (영문·숫자만, 프롬프트에서 @이름) */
export const klingName = (c: Pick<DramaCharacter, "id">) => `char${c.id.replace(/[^a-z0-9]/gi, "").slice(-6)}`;

/**
 * 영상 프롬프트 (장면 1개 또는 여러 장면 묶음).
 * refChars = 참고 이미지로 넣은 인물 (Seedance·MiniMax 는 순서대로 reference image N, Kling 은 @요소이름)
 */
export function videoPrompt(scenes: DramaScene[], cast: DramaCharacter[], o: VideoOptions, refChars: DramaCharacter[] = []): string {
  if (scenes.length === 1 && scenes[0].videoPrompt.trim()) return scenes[0].videoPrompt.trim();
  const m = videoModel(o.modelId);
  const kling = m?.family === "kling";
  const who = (c: DramaCharacter) => (kling && o.mode === "reference" ? `@${klingName(c)}` : c.name);
  const refs =
    o.mode === "reference" && refChars.length
      ? kling
        ? `[REFERENCES] ${refChars.map((c) => `${c.name} is @${klingName(c)}`).join("; ")}. Keep their faces, hairstyles and outfits identical to the element images.`
        : `[REFERENCES] ${refChars.map((c, i) => `${c.name} = the person in reference image ${i + 1}`).join("; ")}. Keep faces, hairstyles and outfits identical to the reference images.`
      : o.mode === "first_frame" || o.mode === "first_last" || o.mode === "multi_shot"
        ? "[REFERENCES] Start exactly from the provided first frame and continue naturally from it. Every character keeps EXACTLY the same face, hairstyle, skin tone and outfit as in the first frame for the whole clip — never morph or replace a face."
        : "";
  const one = (s: DramaScene, i?: number) => {
    const p = sceneParts(s);
    const people = sceneCast(s, cast);
    const blocks = blockingOf(s, people);
    const whoName = (n: string) => {
      const c = cast.find((x) => x.name === n) ?? cast.find((x) => isCharacter(x, n));
      return c ? who(c) : n;
    };
    const lines = dialogueLines(s.dialogue, 4).map((d) => {
      const sp = cast.find((x) => isCharacter(x, d.speaker));
      const b = blocks.find((x) => (sp ? x.name === sp.name : sameName(x.name, d.speaker)));
      return d.speaker ? `${whoName(d.speaker)}${b && blocks.length > 1 ? ` (${b.position})` : ""} says in Korean: "${d.line}"` : `"${d.line}"`;
    });
    return [
      i !== undefined ? `Shot ${i + 1}${s.durationSec ? ` (~${s.durationSec}s)` : ""}:` : "",
      `[SUBJECT] ${people.length ? people.map((c) => `${who(c)} (${characterLine(c)})`).join("; ") + ". " : ""}${p.subject}`,
      blockingLine(blocks, whoName, true),
      s.en?.motion ? `[ACTION] In this order: ${s.en.motion}` : p.action ? `[ACTION] ${p.action}` : "",
      s.en?.keyMoment ? `[END ON] ${s.en.keyMoment}` : "",
      lines.length ? `[DIALOGUE] ${lines.join(" ")} (natural Korean speech with matching lip movement)` : "",
      p.environment ? `[ENVIRONMENT] ${p.environment}` : "",
      p.camera ? `[CAMERA] ${p.camera}` : "",
      p.lighting ? `[LIGHTING] ${p.lighting}` : "",
      p.color ? `[COLOR & TEXTURE] ${p.color}` : "",
      s.sound ? `[SOUND] ${s.sound}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };
  const fmt = `[FORMAT] Korean live-action short drama, ${o.aspect} ${o.aspect === "9:16" ? "vertical" : "horizontal"}, cinematic, realistic.`;
  const body =
    scenes.length === 1
      ? one(scenes[0])
      : [`${scenes.length} consecutive shots in this exact order, with clear cuts between them:`, ...scenes.map((s, i) => one(s, i))].join("\n\n");
  // v0.9.93: 장면 하나는 컷 없이 한 번에, 행동은 클립 안에서 처음부터 끝까지 (결과만 보여 주고 끝나지 않게)
  const single = scenes.length === 1 ? "[SHOT] One continuous shot with no cuts, no scene changes and no time jumps. Show the entire action from its beginning to its end within this clip at a natural pace; do not end before the key action happens." : "";
  return [fmt, refs, single, body, `[CONSTRAINTS] The same characters with identical faces, hairstyles and outfits in every frame. ${NO_SWAP} ${CONSTRAINTS}`].filter(Boolean).join("\n").slice(0, kling ? 2500 : 6000);
}

/** Kling 멀티 샷: 컷마다 500자 이내 프롬프트 */
export function shotPrompts(scenes: DramaScene[], cast: DramaCharacter[], o: VideoOptions): { prompt: string; durationSec: number }[] {
  return scenes.map((s, i) => ({
    prompt: (s.videoPrompt.trim() || videoPrompt([s], cast, { ...o, mode: "first_frame" }).replace(/\[REFERENCES][^\n]*\n?/, "")).slice(0, 500),
    durationSec: o.shotSecs?.[i] ?? s.durationSec,
  }));
}
