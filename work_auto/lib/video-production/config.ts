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
  preset: "superfast",

  /** 무음 정리: 마디마다 앞뒤 무음을 자르고, 마디 사이는 짧은 호흡만 */
  silenceThresholdDb: -35,
  /** 컷 사이 숨 (v0.9.72: 0.1 → 0.04초, 무음이 거의 없게) */
  minSpeechGapSec: 0.04,
  /** 마지막 컷 뒤 여유 (엔딩 GIF 가 보이게) */
  tailSec: 0.6,
  /** 엔딩(최저가 구매링크 + 화살표) 컷 최소 길이 — 화살표가 2초 넘게 보이게 (v0.9.64) */
  endingMinSec: 2.5,
  /** 음성이 없을 때(데모·TTS 미연결) 글자 수로 길이 추정: 초당 글자 */
  charsPerSec: 7,

  /** 원본 글자 처리 */
  /** v0.9.76: 자막·로고를 확대로 가릴 때 최대 배율 (1.35 → 1.6) */
  maxCropZoom: 1.6,
  textMaskPadding: 0.04,
  textMaskTimePaddingSec: 0.3,
  /** 원본 글자 검사: 클립마다 몇 장을 볼지 (AI Vision 1회) */
  scanFrames: 8,

  /** 효과음: 대략 2컷당 1회, 연속 금지 */
  sfxClipInterval: 2,
  sfxMaxPerVideo: 8,

  /** v0.9.80: 목소리·배경음악을 같은 크기(-14 LUFS)로 맞춘 뒤 배경음악은 목소리의 15% */
  volumes: { narration: 1, bgm: 0.15, sfx: 0.55 },
  /** 받은 원본을 저장해 다시 쓸 최대 크기 (Supabase 무료 50MB 한도 안) */
  sourceCacheMaxBytes: 45 * 1024 * 1024,
  /** 원본 저장 기간 */
  sourceCacheDays: 7,
  /** 컷 인코딩 동시 수 */
  encodeParallel: 3,

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
  line2: { size: 92, color: "0xC8FF00", y: 180, maxChars: 16 },
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

/**
 * 주목 효과 (v0.9.64): 강조 컷에 통통 튀는 스티커 (직접 그림 — 저작권 걱정 없음).
 * assets/video/meme 에 GIF 가 있으면 그 GIF 를 먼저 쓴다. 화면 오른쪽 위 (상단 제목 아래), 컷 앞 1.4초
 */
export const ATTENTION_CONFIG = {
  maxPerVideo: 4,
  showSec: 1.4,
  x: 650,
  y: 400,
  width: 360,
  words: ["주목!", "핵심", "꿀팁", "체크!", "대박", "진짜?", "필수", "이거!"],
} as const;

/** 주목 효과 넣을 컷: 효과음 컷 중 첫 컷·마지막 컷·화살표 컷을 빼고 고르게 (최대 4) */
export function attentionSceneIndexes(count: number, sfx: number[], arrows: number[]): number[] {
  const pool = sfx.filter((i) => i > 0 && i < count - 1 && !arrows.includes(i));
  if (pool.length <= ATTENTION_CONFIG.maxPerVideo) return pool;
  const step = pool.length / ATTENTION_CONFIG.maxPerVideo;
  return Array.from({ length: ATTENTION_CONFIG.maxPerVideo }, (_, k) => pool[Math.floor(k * step)]);
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

/** 음성 속도 (v0.9.66): 만든 음성을 FFmpeg atempo 로 빠르게 (음높이 그대로). 기본 2배 */
/** v0.9.80: 0 = 자동(영상 길이에 맞춤). 숫자를 고르면 영상 길이와 상관없이 그 속도 그대로 */
export const VOICE_SPEEDS = [0, 1, 1.25, 1.5, 1.75, 2] as const;
export const DEFAULT_VOICE_SPEED = 2;
export const cleanVoiceSpeed = (v: unknown) => (VOICE_SPEEDS.includes(Number(v) as (typeof VOICE_SPEEDS)[number]) ? Number(v) : DEFAULT_VOICE_SPEED);
/**
 * 영상 길이 맞추기 (v0.9.67): 목표 길이를 고르면 음성 속도를 자동으로 (1~3배). 0 = 자동(말하기 속도대로)
 * v0.9.75: 고른 말하기 속도는 항상 쓰고, 그래도 목표보다 길 때만 더 빠르게 (playTempo)
 * 기본값은 대본을 만들 때 고른 길이 (15s → 15초, 30s → 30초, 60초 이내 → 45초, 3분 → 자동)
 */
export const VIDEO_TARGETS = [0, 15, 30, 45, 60] as const;
export const cleanTarget = (v: unknown) => (VIDEO_TARGETS.includes(Number(v) as (typeof VIDEO_TARGETS)[number]) ? Number(v) : 0);
export const targetFromLength = (length: unknown): number => ({ "15s": 15, "30s": 30, shorts: 45 })[String(length)] ?? 0;
export const MAX_FIT_TEMPO = 3;
/** 목표 길이에 맞는 음성 배속 (줄인 음성 합계 rawSpeech, 컷 사이 여유 fixed) — 느리게는 하지 않는다 */
export function fitTempo(rawSpeech: number, target: number, fixed: number): number {
  if (!target || rawSpeech <= 0) return 1;
  const room = Math.max(1, target - fixed);
  return Math.min(MAX_FIT_TEMPO, Math.max(1, rawSpeech / room));
}
/** 실제 음성 배속 = 고른 속도, 목표 길이를 넘으면 맞출 만큼 더 빠르게 (최대 3배) */
export function playTempo(rawSpeech: number, target: number, fixed: number, speed: unknown): number {
  const chosen = cleanVoiceSpeed(speed);
  if (chosen === 0) return target ? fitTempo(rawSpeech, target, fixed) : 1;
  return chosen;
}
/** 임의 배속 → atempo 사슬 (한 번에 최대 2배) */
export function atempoFor(tempo: number): string {
  let left = Math.max(0.5, tempo);
  const parts: string[] = [];
  while (left > 2.0001) {
    parts.push("atempo=2");
    left /= 2;
  }
  if (Math.abs(left - 1) > 0.001) parts.push(`atempo=${left.toFixed(4)}`);
  return parts.join(",");
}

/**
 * 말 사이 무음 (v0.9.72): 음성 안의 쉼이 이 길이보다 길면 모두 줄인다 (무음 구간 자르기와 같은 방식). 기본 0.1초 (v0.9.75)
 */
export const PAUSE_OPTIONS = [0.1, 0.2, 0.3, 0.5] as const;
export const DEFAULT_PAUSE = 0.1;
export const cleanPause = (v: unknown) => (PAUSE_OPTIONS.includes(Number(v) as (typeof PAUSE_OPTIONS)[number]) ? Number(v) : DEFAULT_PAUSE);

/** ",atempo=2" (atempo 한 번에 0.5~2배) */
export const atempoChain = (v: unknown) => {
  const s = cleanVoiceSpeed(v);
  return s === 1 || s === 0 ? "" : `,atempo=${s}`;
};

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
/**
 * 자막은 항상 1줄 (v0.9.66): 대사가 maxCharsPerLine 보다 길면 띄어쓰기에서 나눠, 음성 길이를 글자 수 비율로 나눠 차례로 보여 준다.
 * 너무 짧은 마지막 조각(3자 이하)은 앞 조각에 붙인다.
 */
export function captionChunks(text: string, max = CAPTION_TEMPLATE.maxCharsPerLine): string[] {
  const t = text.replace(/s+/g, " ").trim();
  const n = Math.ceil(t.length / max);
  if (n <= 1) return t ? [t] : [text];
  // 비슷한 길이로 n 조각: 각 경계는 이상적인 위치에서 가장 가까운 띄어쓰기
  const spaces = [...t].map((c, i) => (c === " " ? i : -1)).filter((i) => i > 0);
  const cuts: number[] = [];
  for (let k = 1; k < n; k++) {
    const ideal = (t.length * k) / n;
    const cand = spaces.filter((i) => i > (cuts.at(-1) ?? 0)).sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal))[0];
    if (cand != null) cuts.push(cand);
  }
  const out: string[] = [];
  let from = 0;
  for (const c of [...cuts.sort((x, y) => x - y), t.length]) {
    const piece = t.slice(from, c).trim();
    if (piece) out.push(piece);
    from = c;
  }
  return out;
}

/** 자막 세로 위치 (화면 높이 비율, 글자 가운데 기준). 가로는 가운데 고정 (v0.9.64) */
export const CAPTION_POSITIONS = [
  { value: "center", label: "가운데", y: 0.5 },
  { value: "lower", label: "살짝 아래", y: 0.62 },
  { value: "bottom", label: "아래", y: 0.72 },
] as const;
export interface CaptionStyle {
  font: (typeof CAPTION_FONTS)[number]["value"];
  color: string;
  /** 테두리 색 (none = 테두리 없음) */
  stroke: string;
  size: (typeof CAPTION_SIZES)[number]["value"];
  position?: (typeof CAPTION_POSITIONS)[number]["value"];
}
export const DEFAULT_CAPTION_STYLE: CaptionStyle = { font: "jua", color: "#FFFFFF", stroke: "#000000", size: "m", position: "lower" };
export const captionCenterY = (style?: CaptionStyle | null) => (CAPTION_POSITIONS.find((p) => p.value === style?.position) ?? CAPTION_POSITIONS[1]).y;

/** 상단 제목 스타일 (v0.9.64): 글꼴·1줄 색·2줄 색·띠 색 */
export const TITLE_BAR_COLORS = ["#000000", "#FFFFFF", "#1E3A8A", "#B91C1C", "#FFE94D", "none"] as const;
export interface TitleStyle {
  font: (typeof CAPTION_FONTS)[number]["value"];
  line1: string;
  line2: string;
  /** 강조색: 제목에서 [ ] 로 감싼 글자 (v0.9.66) */
  accent?: string;
  /** 띠 색 (none = 띠 없이 영상 위에 글자 + 테두리) */
  bar: string;
}
export const DEFAULT_TITLE_STYLE: TitleStyle = { font: "dohyeon", line1: "#FFFFFF", line2: "#C8FF00", accent: "#FFE94D", bar: "#000000" };
/**
 * v0.9.80: 2번째 줄에 [ ] 가 없으면 핵심 낱말 하나를 강조 (숫자가 든 낱말 → 가장 긴 낱말). AI 제목에 [ ] 가 없어 강조색이 안 보이던 문제
 */
export function autoAccent(text: string): string {
  if (/\[[^\]]+\]/.test(text)) return text;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return text;
  const clean = (w: string) => w.replace(/[?!.,~…]+$/, "");
  const pick = words.find((w) => /\d/.test(w)) ?? [...words].sort((a, b) => clean(b).length - clean(a).length)[0];
  const core = clean(pick);
  if (core.length < 2) return text;
  return text.replace(core, `[${core}]`);
}
/** "[강조] 글자" → 조각 (강조 여부). 괄호는 화면에 그리지 않는다 */
export function accentParts(text: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index), accent: false });
    out.push({ text: m[1], accent: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false });
  return out.filter((p) => p.text);
}
const HEX = /^#[0-9a-fA-F]{6}$/;
export function cleanTitleStyle(raw: unknown): TitleStyle {
  const r = (raw ?? {}) as Partial<TitleStyle>;
  const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toUpperCase() : d);
  return {
    font: CAPTION_FONTS.some((f) => f.value === r.font) ? (r.font as TitleStyle["font"]) : DEFAULT_TITLE_STYLE.font,
    line1: hex(r.line1, DEFAULT_TITLE_STYLE.line1),
    line2: hex(r.line2, DEFAULT_TITLE_STYLE.line2),
    accent: hex(r.accent, DEFAULT_TITLE_STYLE.accent!),
    bar: r.bar === "none" ? "none" : hex(r.bar, DEFAULT_TITLE_STYLE.bar),
  };
}

export function cleanCaptionStyle(raw: unknown): CaptionStyle {
  const r = (raw ?? {}) as Partial<CaptionStyle>;
  return {
    position: CAPTION_POSITIONS.some((p) => p.value === r.position) ? r.position : DEFAULT_CAPTION_STYLE.position,
    font: CAPTION_FONTS.some((f) => f.value === r.font) ? (r.font as CaptionStyle["font"]) : DEFAULT_CAPTION_STYLE.font,
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toUpperCase() : DEFAULT_CAPTION_STYLE.color,
    stroke: r.stroke === "none" ? "none" : typeof r.stroke === "string" && HEX.test(r.stroke) ? r.stroke.toUpperCase() : DEFAULT_CAPTION_STYLE.stroke,
    size: CAPTION_SIZES.some((s) => s.value === r.size) ? (r.size as CaptionStyle["size"]) : DEFAULT_CAPTION_STYLE.size,
  };
}
