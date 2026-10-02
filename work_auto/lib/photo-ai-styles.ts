/** 제품 사진 AI 배경 연출 선택지 (화면·서버 공용). 서버의 장면 설명은 lib/server/services/photo-ai.ts */
export const PHOTO_AI_STYLE_OPTIONS = [
  { value: "studio", label: "흰 배경 스튜디오" },
  { value: "living", label: "밝은 거실" },
  { value: "desk", label: "책상 위" },
  { value: "kitchen", label: "주방" },
  { value: "outdoor", label: "야외" },
] as const;
