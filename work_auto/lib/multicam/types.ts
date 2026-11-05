/**
 * AI 메이크업 · 멀티앵글 (v0.9.176) — 카메라 1대로 찍은 영상 하나를, 같은 연기 그대로 컷마다 다른 카메라 구도로 다시 만든다.
 * Kie Seedance (reference_video_urls). 레퍼런스: 차 안 GRWM 원본 30초 → 정면·눈 가까이·마스카라·입술 디테일·옆 45°·정면 12.8초
 */
export type AngleId = "front" | "eye" | "eye34" | "lash" | "lip" | "side" | "hand" | "top" | "push";
export const MULTICAM_ANGLES: { value: AngleId; label: string; en: string }[] = [
  { value: "front", label: "원본 정면", en: "The original front-facing medium shot exactly as in the source video" },
  { value: "eye34", label: "눈·아이섀도 (살짝 위 45°)", en: "Eyeshadow close-up from a slightly higher three-quarter camera position, the original brush movement on the eyelid" },
  { value: "eye", label: "눈 가까이", en: "Tight eye-area close-up, one eye and brow filling the frame" },
  { value: "lash", label: "마스카라·속눈썹", en: "Extreme close-up of the eye with the mascara wand and lashes clearly visible" },
  { value: "lip", label: "입술 디테일", en: "Lip detail shot, lips and the lip product applicator filling the frame, true color of the product visible" },
  { value: "side", label: "옆 45°", en: "True side three-quarter camera angle from the passenger side. The CAMERA changes position; the person does not turn her head to fake a side shot" },
  { value: "hand", label: "손·제품 매크로", en: "Macro close-up of the hand and the product, packaging and texture filling the frame" },
  { value: "top", label: "위에서", en: "High angle looking down at the face, hands and product" },
  { value: "push", label: "천천히 다가가기", en: "Slow smooth push-in from a medium shot to a close-up of the face (the only moving camera)" },
];

export interface MulticamCut {
  start: number;
  end: number;
  angle: AngleId;
  /** 이 구간에 하는 일 (예: 쿠션, 마스카라) — 프롬프트에 함께 */
  note: string;
}

export type MulticamModel = "mini" | "s25";
export const MULTICAM_MODELS: { value: MulticamModel; label: string; kie: string; maxIn: number; maxOut: number; credits: Record<"480p" | "720p", number> }[] = [
  // Kie 가격(2026-11): 영상 입력이 있으면 (입력 초 + 출력 초) × 단가
  { value: "mini", label: "Seedance 2 Mini (저렴)", kie: "bytedance/seedance-2-mini", maxIn: 15, maxOut: 15, credits: { "480p": 2.4, "720p": 5 } },
  { value: "s25", label: "Seedance 2.5 (고품질·30초)", kie: "bytedance/seedance-2-5", maxIn: 30, maxOut: 30, credits: { "480p": 17, "720p": 38 } },
];

export const multicamCredits = (model: MulticamModel, res: "480p" | "720p", seconds: number) => {
  const m = MULTICAM_MODELS.find((x) => x.value === model) ?? MULTICAM_MODELS[0];
  // 입력 + 출력 (같은 길이)
  return Math.ceil(m.credits[res] * seconds * 2);
};
