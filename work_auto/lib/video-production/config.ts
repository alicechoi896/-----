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
export const VOICE_OPTIONS = [
  { value: "onyx", label: "남성 · 낮고 또렷함" },
  { value: "echo", label: "남성 · 밝음" },
  { value: "nova", label: "여성 · 밝음" },
  { value: "shimmer", label: "여성 · 부드러움" },
  { value: "alloy", label: "중성" },
] as const;
