/**
 * 영상 자동 제작 설정 (v0.9.51) — 숫자·디자인은 여기서만 바꾼다. docs/VIDEO_PRODUCTION.md
 * 상단 제목·자막 디자인은 AI 가 바꾸지 않는다 (고정 템플릿).
 * 좌표는 1080×1920 기준 픽셀. 각도는 시계 방향 + (ffmpeg rotate 와 같음).
 */
import type { VideoChannel } from "@/lib/types/video-production";

export const VIDEO_RENDER_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** libx264 품질 (낮을수록 고화질·큰 파일) */
  crf: 23,
  preset: "veryfast",

  /** 무음 정리: 마디마다 앞뒤 무음을 자르고, 마디 사이는 짧은 호흡만 */
  silenceThresholdDb: -40,
  minSpeechGapSec: 0.1,
  /** 마지막 컷 뒤 여유 (엔딩 GIF 가 보이게) */
  tailSec: 0.6,
  /** 음성이 없을 때(데모·TTS 미연결) 글자 수로 길이 추정: 초당 글자 */
  charsPerSec: 7,

  /** 원본 글자 처리 */
  maxCropZoom: 1.35,
  textMaskPadding: 0.04,
  textMaskTimePaddingSec: 0.3,
  /** 원본 글자 검사: 클립마다 몇 장을 볼지 (AI Vision 1회) */
  scanFrames: 8,

  /** 효과음: 대략 2컷당 1회, 연속 금지 */
  sfxClipInterval: 2,
  sfxMaxPerVideo: 8,

  volumes: { narration: 1, bgm: 0.12, sfx: 0.55 },

  /** 원본 다운로드 제한 */
  maxSourceBytes: 80 * 1024 * 1024,
  maxScenes: 30,
} as const;

/** 상단 제목 (검은 띠 + 2줄). 1줄 흰색, 2줄 연두색 — 브루 템플릿 그대로 */
export const TOP_TITLE_TEMPLATE = {
  barHeight: 330,
  barColor: "black",
  font: "dohyeon",
  line1: { size: 96, color: "white", y: 46, maxChars: 14 },
  line2: { size: 76, color: "0xC8FF00", y: 190, maxChars: 18 },
  borderW: 0,
} as const;

/** 자체 자막 (화면 가운데, 흰 글자 + 검은 테두리) */
export const CAPTION_TEMPLATE = {
  font: "jua",
  size: 74,
  color: "white",
  borderColor: "black",
  borderW: 7,
  /** 글자 가운데 기준 y (화면 높이 비율) */
  centerY: 0.56,
  maxCharsPerLine: 14,
} as const;

/** 마지막 '최저가 구매링크' (레시피코리아체) */
export const ENDING_TEMPLATE = {
  font: "recipe",
  lines: [
    { text: "최저가", size: 120, color: "0xFF3B5C" },
    { text: "구매링크", size: 120, color: "0x7CFF3B" },
  ],
  x: 520,
  y: 1000,
  borderColor: "black",
  borderW: 8,
} as const;

/**
 * 제품 버튼을 가리키는 화살표 (assets/video/arrow — 왼쪽을 가리키는 GIF 를 돌려서 쓴다).
 * YouTube Shorts·NAVER 클립 모두 제품 버튼이 화면 왼쪽 아래 → 기본은 아래(-90°).
 */
export const ARROW_PLACEMENT: Record<VideoChannel, { x: number; y: number; size: number; angle: number }> = {
  youtube: { x: 60, y: 1280, size: 300, angle: -90 },
  "naver-clip": { x: 60, y: 1280, size: 300, angle: -90 },
};

/** 엔딩 화살표 (assets/video/ending — 아래로 휘는 화살표를 왼쪽 아래로 기울임) */
export const ENDING_ARROW_PLACEMENT: Record<VideoChannel, { x: number; y: number; height: number; angle: number }> = {
  youtube: { x: 300, y: 1260, height: 420, angle: 30 },
  "naver-clip": { x: 300, y: 1260, height: 420, angle: 30 },
};

/** 화살표를 넣을 컷 (0부터): 4번째 컷 + 컷이 10개 이상이면 60% 지점 */
export function arrowSceneIndexes(count: number): number[] {
  const out = new Set<number>();
  if (count >= 5) out.add(3);
  if (count >= 10) out.add(Math.round(count * 0.6));
  return [...out].filter((i) => i < count - 1);
}

/** 효과음 넣을 컷: 강조 컷 우선, 약 2컷당 1회, 연속 금지, 첫 컷(Hook)은 항상 */
export function sfxSceneIndexes(count: number, emphasis: number[]): number[] {
  const want = Math.min(VIDEO_RENDER_CONFIG.sfxMaxPerVideo, Math.max(1, Math.round(count / VIDEO_RENDER_CONFIG.sfxClipInterval)));
  const picked: number[] = [0];
  const ok = (i: number) => i > 0 && i < count && !picked.some((p) => Math.abs(p - i) < 2);
  for (const i of emphasis) if (picked.length < want && ok(i)) picked.push(i);
  for (let i = 1; i < count && picked.length < want; i++) if (ok(i)) picked.push(i);
  return picked.sort((a, b) => a - b);
}

export const VIDEO_FEATURE_CHANNEL: Record<string, VideoChannel> = {
  "yt-video-production": "youtube",
  "clip-video-production": "naver-clip",
};

/** 영상 제작에 쓸 수 있는 대본 (2단계 결과) */
export const VIDEO_SCRIPT_FEATURES: Record<VideoChannel, string[]> = {
  youtube: ["yt-product-video", "yt-info-video"],
  "naver-clip": ["clip-product-content", "clip-info-content"],
};

/** OpenAI TTS 목소리 (lib/server/providers/tts) */
/**
 * AI 컷 (v0.9.60) — Kie AI (docs/VIDEO_PRODUCTION.md). 모델을 바꾸려면 여기만 고친다.
 * - product: Wan 2.6 Flash 이미지→영상 (입력 사진 비율 그대로 → 서버가 9:16 사진을 만들어 보낸다), 5초 720p 소리 없음 = 20크레딧(약 $0.10)
 * - text: Grok Imagine Video 1.5 글→영상 (9:16), 5초 720p = 초당 4.5크레딧 → 22.5크레딧(약 $0.11). 소리는 항상 만들어지지만 렌더할 때 뺀다 (v0.9.61)
 * 소리는 만들지 않는다 (AI 음성·배경음악을 우리가 넣는다).
 */
export const AI_CLIP_CONFIG = {
  creditUsd: 0.005,
  defaultCount: 3,
  maxCount: 10,
  product: { model: "wan/2-6-flash-image-to-video", duration: "5", resolution: "720p", credits: 20 as number | null },
  text: { model: "grok-imagine-video-1-5-preview", duration: 5, resolution: "720p", aspectRatio: "9:16", credits: 22.5 as number | null },
  /** 9:16 입력 사진 크기 */
  imageWidth: 720,
  imageHeight: 1280,
} as const;

/** 예상 비용 (모르는 모델은 null) */
export function estimateAiClipUsd(modes: ("product" | "text")[]): { usd: number; unknown: number } {
  let usd = 0;
  let unknown = 0;
  for (const m of modes) {
    const c = AI_CLIP_CONFIG[m].credits;
    if (c == null) unknown++;
    else usd += c * AI_CLIP_CONFIG.creditUsd;
  }
  return { usd: Number(usd.toFixed(2)), unknown };
}

/** OpenAI gpt-4o-mini-tts 목소리 (v0.9.63: 5 → 13가지) */
export const VOICE_OPTIONS = [
  { value: "onyx", label: "남성 · 낮고 또렷함" },
  { value: "ash", label: "남성 · 차분하고 단단함" },
  { value: "echo", label: "남성 · 밝음" },
  { value: "cedar", label: "남성 · 자연스러운 대화" },
  { value: "verse", label: "남성 · 생동감" },
  { value: "fable", label: "중성 · 이야기꾼" },
  { value: "alloy", label: "중성 · 담백함" },
  { value: "nova", label: "여성 · 밝음" },
  { value: "coral", label: "여성 · 따뜻함" },
  { value: "marin", label: "여성 · 자연스러운 대화" },
  { value: "shimmer", label: "여성 · 부드러움" },
  { value: "sage", label: "여성 · 차분함" },
  { value: "ballad", label: "여성 · 감성적" },
] as const;

/** 말투 (TTS instructions) — 같은 목소리도 말투로 느낌이 크게 달라진다 */
export const VOICE_STYLES = [
  { value: "shorts", label: "쇼츠 · 밝고 빠르게", instructions: "한국어 쇼츠 내레이션. 밝고 또렷하게, 조금 빠른 속도로, 문장 끝을 늘이지 않는다." },
  { value: "friend", label: "친구처럼 · 편하게", instructions: "친한 친구에게 꿀팁을 알려 주듯 편하고 자연스러운 한국어 반말 느낌의 말투. 웃음기 있게, 속도는 보통." },
  { value: "review", label: "리뷰어 · 신뢰감", instructions: "믿음 가는 제품 리뷰 유튜버. 차분하고 또박또박, 핵심 단어에 힘을 준다. 과장하지 않는다." },
  { value: "excited", label: "언박싱 · 신나게", instructions: "새 제품을 처음 열어 보는 듯 신나고 놀란 말투. 에너지 높게, 빠르게, 감탄을 살린다." },
  { value: "calm", label: "설명 · 차분하게", instructions: "정보를 정리해 주는 차분한 아나운서 말투. 또렷하고 안정적인 속도, 문장 사이 짧게 쉰다." },
  { value: "whisper", label: "ASMR · 속삭이듯", instructions: "조용히 속삭이듯 부드럽고 가까운 말투. 천천히, 숨소리는 적게." },
] as const;
export const voiceInstructions = (style: string | null | undefined) => (VOICE_STYLES.find((v) => v.value === style) ?? VOICE_STYLES[0]).instructions;

/** 자막 스타일 (v0.9.63): 글꼴·글자색·테두리색·크기를 고른다 */
export const CAPTION_FONTS = [
  { value: "jua", label: "배달의민족 주아체" },
  { value: "dohyeon", label: "배달의민족 도현체" },
  { value: "recipe", label: "레시피코리아체" },
  { value: "pretendard", label: "프리텐다드 (굵게)" },
] as const;
export const CAPTION_COLORS = ["#FFFFFF", "#FFE94D", "#C8FF00", "#7FE7FF", "#FF8FB1", "#FF4D4D", "#111111"] as const;
export const CAPTION_STROKES = ["#000000", "#FFFFFF", "#1E3A8A", "none"] as const;
export const CAPTION_SIZES = [
  { value: "s", label: "작게", size: 62 },
  { value: "m", label: "보통", size: 74 },
  { value: "l", label: "크게", size: 88 },
] as const;
export interface CaptionStyle {
  font: (typeof CAPTION_FONTS)[number]["value"];
  color: string;
  /** 테두리 색 (none = 테두리 없음) */
  stroke: string;
  size: (typeof CAPTION_SIZES)[number]["value"];
}
export const DEFAULT_CAPTION_STYLE: CaptionStyle = { font: "jua", color: "#FFFFFF", stroke: "#000000", size: "m" };
const HEX = /^#[0-9a-fA-F]{6}$/;
export function cleanCaptionStyle(raw: unknown): CaptionStyle {
  const r = (raw ?? {}) as Partial<CaptionStyle>;
  return {
    font: CAPTION_FONTS.some((f) => f.value === r.font) ? (r.font as CaptionStyle["font"]) : DEFAULT_CAPTION_STYLE.font,
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toUpperCase() : DEFAULT_CAPTION_STYLE.color,
    stroke: r.stroke === "none" ? "none" : typeof r.stroke === "string" && HEX.test(r.stroke) ? r.stroke.toUpperCase() : DEFAULT_CAPTION_STYLE.stroke,
    size: CAPTION_SIZES.some((s) => s.value === r.size) ? (r.size as CaptionStyle["size"]) : DEFAULT_CAPTION_STYLE.size,
  };
}
