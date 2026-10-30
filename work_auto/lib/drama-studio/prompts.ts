import { dialogueLines } from "@/lib/drama/prompt";
import { videoModel, type VideoOptions } from "./models";
import type { Aspect, DramaCharacter, DramaScene, SheetKind } from "./types";

/**
 * 이미지·영상 영어 프롬프트 (v0.9.81). docs/DRAMA_STUDIO.md
 * 틀: [FORMAT] [REFERENCES] [SUBJECT] [ACTION] [ENVIRONMENT] [CAMERA] [LIGHTING] [COLOR & TEXTURE] [CONSTRAINTS]
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

export function characterLine(c: DramaCharacter): string {
  return [c.appearanceEn || c.appearance, c.outfit && !c.appearanceEn ? `wearing ${c.outfit}` : ""].filter(Boolean).join(", ");
}

/** 캐릭터 시트 이미지 프롬프트. hasReference = 기준 이미지를 참고로 넣었는가 */
export function sheetPrompt(c: DramaCharacter, kind: SheetKind, hasReference: boolean, styleNote = ""): string {
  const m = sheetMeta(kind);
  return [
    `[FORMAT] Character reference sheet image, ${m.aspect} portrait, Korean drama, cinematic realistic photo.`,
    hasReference ? "[REFERENCES] The reference image(s) show this exact character. Keep exactly the same face, hairstyle, skin tone and outfit." : "",
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

/** 스토리보드 이미지 프롬프트. refs = 넣는 기준 이미지의 주인 (순서대로 reference image 1, 2…) */
export function framePrompt(s: DramaScene, cast: DramaCharacter[], aspect: Aspect, refs: DramaCharacter[]): string {
  if (s.imagePrompt.trim()) return s.imagePrompt.trim();
  const p = sceneParts(s);
  const people = cast.filter((c) => s.characterIds.includes(c.id));
  return [
    `[FORMAT] Single storyboard frame for a Korean live-action short drama, ${aspect} ${aspect === "9:16" ? "vertical" : "horizontal"}, cinematic still, one moment only (not a collage, no panels).`,
    refs.length ? `[REFERENCES] ${refs.map((c, i) => `${c.name} = the person in reference image ${i + 1}; keep the same face, hairstyle and outfit`).join(". ")}.` : "",
    `[SUBJECT] ${people.length ? people.map((c) => `${c.name} (${characterLine(c)})`).join("; ") + ". " : ""}${p.subject}`,
    p.action ? `[ACTION] ${p.action}` : "",
    p.environment ? `[ENVIRONMENT] ${p.environment}` : "",
    p.camera ? `[CAMERA] ${p.camera}` : "",
    p.lighting ? `[LIGHTING] ${p.lighting}` : "",
    p.color ? `[COLOR & TEXTURE] ${p.color}` : "",
    `[CONSTRAINTS] ${CONSTRAINTS}`,
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
        ? "[REFERENCES] Start exactly from the provided first frame; keep every character's face, hairstyle and outfit unchanged."
        : "";
  const one = (s: DramaScene, i?: number) => {
    const p = sceneParts(s);
    const people = cast.filter((c) => s.characterIds.includes(c.id));
    const lines = dialogueLines(s.dialogue, 4).map((d) => {
      const c = cast.find((x) => x.name === d.speaker);
      return d.speaker ? `${c ? who(c) : d.speaker} says in Korean: "${d.line}"` : `"${d.line}"`;
    });
    return [
      i !== undefined ? `Shot ${i + 1}${s.durationSec ? ` (~${s.durationSec}s)` : ""}:` : "",
      `[SUBJECT] ${people.length ? people.map((c) => `${who(c)} (${characterLine(c)})`).join("; ") + ". " : ""}${p.subject}`,
      p.action ? `[ACTION] ${p.action}` : "",
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
  return [fmt, refs, body, `[CONSTRAINTS] Consistent characters in every shot. ${CONSTRAINTS}`].filter(Boolean).join("\n").slice(0, kling ? 2500 : 6000);
}

/** Kling 멀티 샷: 컷마다 500자 이내 프롬프트 */
export function shotPrompts(scenes: DramaScene[], cast: DramaCharacter[], o: VideoOptions): { prompt: string; durationSec: number }[] {
  return scenes.map((s, i) => ({
    prompt: (s.videoPrompt.trim() || videoPrompt([s], cast, { ...o, mode: "first_frame" }).replace(/\[REFERENCES][^\n]*\n?/, "")).slice(0, 500),
    durationSec: o.shotSecs?.[i] ?? s.durationSec,
  }));
}
