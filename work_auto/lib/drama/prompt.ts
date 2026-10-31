import type { DramaModelId } from "./config";
import type { DramaCharacter, DramaScene } from "@/lib/types/drama";

/**
 * 장면 → 모델별 프롬프트 (v0.9.62). 영어 틀 + 한국어 내용(대사는 그대로 한국어로 말하게).
 * - MiniMax H3·Seedance: 참고 사진 순서대로 "reference image N" 으로 인물을 가리킨다 (문서에 참조 문법이 없어 글로 설명)
 * - Kling 3.0: 인물 요소 이름을 @char1 처럼 부른다 (kling_elements)
 */
export const klingElementName = (c: Pick<DramaCharacter, "id">) => `char${c.id.replace(/\D/g, "") || "1"}`;

export function dialogueLines(text: string, max = 6): { speaker: string; line: string }[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((l) => {
      const m = l.match(/^([^:：]{1,12})[:：]\s*(.+)$/);
      return m ? { speaker: m[1].trim(), line: m[2].trim().slice(0, 120) } : { speaker: "", line: l.slice(0, 120) };
    });
}

export function buildDramaPrompt(scene: DramaScene, characters: DramaCharacter[], model: DramaModelId): string {
  const cast = characters.filter((c) => c.imageUrl);
  // v0.9.115 시작 화면 방식(Veo Lite·Grok 1.5·PixVerse): 첫 인물 사진에서 시작하고, 나머지 인물은 글로만 묘사
  if (model === "veo-lite" || model === "grok-15" || model === "pixverse-v6max") {
    const lines = dialogueLines(scene.dialogue);
    return [
      "Vertical 9:16 cinematic Korean short drama scene, realistic, natural lighting, smooth camera.",
      cast[0] ? `Start from the provided first frame: ${cast[0].name} is the person in it — keep exactly the same face, hairstyle and outfit for the whole clip.` : "",
      ...cast.slice(1).map((c) => `${c.name}: ${c.description || "another person in the scene"}.`),
      `Scene: ${scene.description}`,
      lines.length ? "Dialogue, spoken aloud in natural Korean with matching lip movement (keep the Korean words exactly):" : "",
      ...lines.map((d) => (d.speaker ? `${d.speaker}: "${d.line}"` : `"${d.line}"`)),
      "No subtitles, no on-screen text, no watermark.",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
  }
  const who = cast.map((c, i) =>
    model === "kling3"
      ? `${c.name} @${klingElementName(c)}: ${c.description || "the person in the element images"}.`
      : `${c.name} = the person in reference image ${i + 1} (${c.description || "same face, hairstyle and outfit as the reference"}). Keep exactly the same face, hairstyle and outfit as reference image ${i + 1}.`,
  );
  const lines = dialogueLines(scene.dialogue);
  return [
    "Vertical 9:16 cinematic Korean short drama scene, realistic, natural lighting, smooth camera, consistent characters across scenes.",
    ...who,
    `Scene: ${scene.description}`,
    lines.length ? "Dialogue, spoken aloud in natural Korean with matching lip movement (keep the Korean words exactly):" : "",
    ...lines.map((d) => (d.speaker ? `${d.speaker}: "${d.line}"` : `"${d.line}"`)),
    "No subtitles, no on-screen text, no watermark.",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, model === "kling3" ? 2400 : 6000);
}
