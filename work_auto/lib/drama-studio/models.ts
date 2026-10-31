import type { Aspect, GenMode } from "./types";

/**
 * AI 드라마 스튜디오 — Kie 모델 목록과 지원 범위 (화면·서버 공용). docs/DRAMA_STUDIO.md
 * 값은 docs.kie.ai 모델 문서 기준 (2026-10-30 확인). 가격은 kie.ai/pricing 의 '최소 단가'만 공개돼 있어
 * 화면에는 '최소 예상'으로만 보여 주고, 실제 사용량은 작업이 끝난 뒤 Kie 가 돌려준 creditsConsumed 를 따로 보여 준다.
 * 1 크레딧 = $0.005.
 */
export const CREDIT_USD = 0.005;

export interface VideoModel {
  id: string;
  label: string;
  /** Kie model 값 */
  model: string;
  family: "seedance" | "kling" | "minimax" | "veo" | "grok" | "pixverse";
  /** v0.9.106: 방식마다 Kie model 이 다를 때 (PixVerse 이미지→영상 / 글→영상) */
  modelByMode?: Partial<Record<GenMode, string>>;
  /** v0.9.106: 고를 수 있는 길이가 정해진 값뿐일 때 (Veo 4·6·8초) */
  durations?: number[];
  /** Veo: input.model 값 (veo3_lite 등) */
  subModel?: string;
  modes: GenMode[];
  /** 한 번에 만들 수 있는 길이 (초) */
  minSec: number;
  maxSec: number;
  resolutions: string[];
  defaultResolution: string;
  aspects: Aspect[];
  /** 소리: toggle 켜고 끄기 / always 항상 / none 없음 */
  audio: "toggle" | "always" | "none";
  maxReferenceImages: number;
  /** 첫+끝 프레임 */
  supportsLastFrame: boolean;
  /** 여러 장면을 순서대로 이어 만드는 기능 (Kling 3.0 multi_shots) */
  multiShot: { maxShots: number; minShotSec: number; maxShotSec: number } | null;
  /** 최소 단가 (크레딧/초, kie.ai/pricing '부터' 값). null = 공개 가격 확인 안 됨 */
  minCreditsPerSec: number | null;
  /** v0.9.104: 해상도별 단가 (영상 입력 없음 기준, 확인된 모델만) */
  creditsPerSecByRes?: Record<string, number>;
  priceNote: string;
  note: string;
}

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "seedance-2-mini",
    label: "Seedance 2.0 Mini",
    model: "bytedance/seedance-2-mini",
    family: "seedance",
    modes: ["first_frame", "first_last", "reference", "text"],
    minSec: 4,
    maxSec: 15,
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    maxReferenceImages: 9,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: 3.8,
    creditsPerSecByRes: { "480p": 3.8, "720p": 8.2 },
    priceNote: "480p 3.8 · 720p 8.2 크레딧/초",
    note: "샷 기본 · 가장 저렴 · 4~15초",
  },
  {
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast",
    model: "bytedance/seedance-2-fast",
    family: "seedance",
    modes: ["first_frame", "first_last", "reference", "text"],
    minSec: 4,
    maxSec: 15,
    resolutions: ["480p", "720p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    maxReferenceImages: 9,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: 6.8,
    priceNote: "6.8 크레딧/초부터 (해상도·소리에 따라 더 높음)",
    note: "기본 추천 · 빠르고 저렴 · 4~15초",
  },
  {
    id: "seedance-2",
    label: "Seedance 2.0",
    model: "bytedance/seedance-2",
    family: "seedance",
    modes: ["first_frame", "first_last", "reference", "text"],
    minSec: 4,
    maxSec: 15,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    maxReferenceImages: 9,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: 11.5,
    priceNote: "11.5 크레딧/초부터",
    note: "품질 우선 · 4~15초 · 1080p",
  },
  {
    id: "seedance-2-5",
    label: "Seedance 2.5",
    model: "bytedance/seedance-2-5",
    family: "seedance",
    modes: ["first_frame", "first_last", "reference", "text"],
    minSec: 4,
    maxSec: 30,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    maxReferenceImages: 30,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: 17,
    priceNote: "17 크레딧/초부터",
    note: "최신 · 4~30초 · 참고 이미지 30장",
  },
  {
    id: "kling-3",
    label: "Kling 3.0",
    model: "kling-3.0/video",
    family: "kling",
    modes: ["first_frame", "first_last", "reference", "multi_shot", "text"],
    minSec: 3,
    maxSec: 15,
    resolutions: ["std", "pro"],
    defaultResolution: "std",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    // 인물 요소 3개 × 사진 2~4장
    maxReferenceImages: 12,
    supportsLastFrame: true,
    multiShot: { maxShots: 5, minShotSec: 1, maxShotSec: 12 },
    minCreditsPerSec: 14,
    priceNote: "14 크레딧/초부터 (pro·소리는 더 높음)",
    note: "여러 장면 순서대로(최대 5컷) · 인물 요소(@이름) · 3~15초",
  },
  {
    id: "minimax-h3",
    label: "MiniMax H3",
    model: "minimax-h3/reference-to-video",
    family: "minimax",
    modes: ["reference"],
    minSec: 4,
    maxSec: 15,
    resolutions: ["768P", "2K"],
    defaultResolution: "768P",
    aspects: ["9:16", "16:9"],
    audio: "always",
    maxReferenceImages: 9,
    supportsLastFrame: false,
    multiShot: null,
    minCreditsPerSec: null,
    priceNote: "공개 가격 확인 안 됨 (끝난 뒤 실제 크레딧 표시)",
    note: "참고 이미지만 · 소리 항상 · 4~15초",
  },
];
/**
 * v0.9.106 비교용 모델 (docs.kie.ai 2026-11-01 확인)
 * - Veo 3.1 Lite: model 'veo-3-1' + input.model 'veo3_lite', generation_type TEXT_2_VIDEO / FIRST_AND_LAST_FRAMES_2_VIDEO(image_urls 1~2장), 4·6·8초, 720p/1080p, 소리 항상
 * - Grok Imagine Video 1.5 Preview: 'grok-imagine-video-1-5-preview', first_frame_url·last_frame_url 또는 image_urls(참고 1장), 1~15초, 480p/720p/1080p, 소리 끌 수 없음
 * - PixVerse V6 Max: 'pixverse-v6-max/image-to-video'(image_urls 1장, 비율은 이미지 따라감) · 'pixverse-v6-max/text-to-video', quality 360p~1080p, 1~15초, 소리 선택
 */
VIDEO_MODELS.push(
  {
    id: "veo-3-1-lite",
    label: "Veo 3.1 Lite",
    model: "veo-3-1",
    subModel: "veo3_lite",
    family: "veo",
    modes: ["first_frame", "first_last", "text"],
    minSec: 4,
    maxSec: 8,
    durations: [4, 6, 8],
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "always",
    maxReferenceImages: 0,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: null,
    priceNote: "영상 1개 단위 가격 (정확한 값 확인 안 됨 — 끝난 뒤 실제 크레딧 표시)",
    note: "Google · 4·6·8초 · 소리 항상",
  },
  {
    id: "grok-imagine-1-5",
    label: "Grok Imagine Video 1.5",
    model: "grok-imagine-video-1-5-preview",
    family: "grok",
    modes: ["first_frame", "first_last", "reference", "text"],
    minSec: 1,
    maxSec: 15,
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "always",
    maxReferenceImages: 1,
    supportsLastFrame: true,
    multiShot: null,
    minCreditsPerSec: 2.4,
    priceNote: "2.4 크레딧/초부터 (해상도별 값 확인 안 됨)",
    note: "Preview · 1~15초 · 소리 항상",
  },
  {
    id: "pixverse-v6-max",
    label: "PixVerse V6 Max",
    model: "pixverse-v6-max/image-to-video",
    modelByMode: { first_frame: "pixverse-v6-max/image-to-video", text: "pixverse-v6-max/text-to-video" },
    family: "pixverse",
    modes: ["first_frame", "text"],
    minSec: 1,
    maxSec: 15,
    resolutions: ["540p", "720p", "1080p"],
    defaultResolution: "720p",
    aspects: ["9:16", "16:9"],
    audio: "toggle",
    maxReferenceImages: 0,
    supportsLastFrame: false,
    multiShot: null,
    minCreditsPerSec: 4.8,
    creditsPerSecByRes: { "720p": 12, "1080p": 22.4 },
    priceNote: "360p 4.8 · 720p 12 · 1080p 22.4 크레딧/초 (소리 포함 값)",
    note: "1~15초 · 첫 프레임(비율은 이미지 따라감)",
  },
);

/** 길이를 모델이 받는 값으로 (범위 안 · 정해진 값이 있으면 가장 가까운 값) */
export function fitDuration(m: Pick<VideoModel, "minSec" | "maxSec" | "durations">, sec: number): number {
  const s = Math.min(m.maxSec, Math.max(m.minSec, Math.round(sec)));
  return m.durations?.length ? m.durations.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a)) : s;
}
/** 고를 수 있는 길이 목록 */
export const durationChoices = (m: Pick<VideoModel, "minSec" | "maxSec" | "durations">) => m.durations ?? Array.from({ length: m.maxSec - m.minSec + 1 }, (_, i) => m.minSec + i);

/** Kie 에 보낼 model 값 (방식마다 다른 모델) */
export const kieModelOf = (modelId: string, mode: GenMode) => {
  const m = videoModel(modelId);
  return m?.modelByMode?.[mode] ?? m?.model ?? modelId;
};

export const DEFAULT_VIDEO_MODEL = "seedance-2-fast";
/** v0.9.104: 샷 단위 영상 기본 (720p · 5초) */
export const DEFAULT_SHOT_MODEL = "seedance-2-mini";
export const videoModel = (id: string) => VIDEO_MODELS.find((m) => m.id === id) ?? null;

export const MODE_LABEL: Record<GenMode, string> = {
  first_frame: "첫 프레임 (스토리보드 이미지에서 시작)",
  first_last: "첫 + 끝 프레임",
  reference: "참고 이미지 (인물·장면 외형 참고)",
  multi_shot: "여러 장면 순서대로 (멀티 샷)",
  text: "글만 (이미지 없이)",
};

export interface ImageModel {
  id: string;
  label: string;
  model: string;
  /** 참고 이미지 최대 (0 = 글만) */
  maxReferenceImages: number;
  aspects: string[];
  minCreditsPerImage: number | null;
  note: string;
}

export const IMAGE_MODELS: ImageModel[] = [
  { id: "nano-banana-edit", label: "Nano Banana Edit (참고 이미지)", model: "google/nano-banana-edit", maxReferenceImages: 10, aspects: ["1:1", "9:16", "16:9", "3:4", "4:3"], minCreditsPerImage: 4, note: "기준 이미지를 참고해 같은 인물 유지 · 참고 이미지 최대 10장" },
  { id: "nano-banana", label: "Nano Banana (글만)", model: "google/nano-banana", maxReferenceImages: 0, aspects: ["1:1", "9:16", "16:9", "3:4", "4:3"], minCreditsPerImage: 4, note: "참고 이미지 없이 처음 만들 때" },
];
export const imageModel = (id: string) => IMAGE_MODELS.find((m) => m.id === id) ?? null;

export interface VideoOptions {
  modelId: string;
  mode: GenMode;
  durationSec: number;
  resolution: string;
  aspect: Aspect;
  audio: boolean;
  /** multi_shot: 컷별 길이 */
  shotSecs?: number[];
}

/**
 * 영상 옵션 검사 (화면·서버 같은 규칙). 오류 문장 목록 (빈 배열 = 통과)
 * - 첫 프레임 / 첫+끝 프레임 / 참고 이미지 / 멀티 샷은 서로 섞지 않는다 (요청에는 한 가지 입력만 넣는다)
 */
export function validateVideo(o: VideoOptions, refs: { first?: boolean; last?: boolean; references: number; scenes: number }): string[] {
  const m = videoModel(o.modelId);
  if (!m) return ["지원하지 않는 영상 모델입니다."];
  const errs: string[] = [];
  if (!m.modes.includes(o.mode)) errs.push(`${m.label} 은 '${MODE_LABEL[o.mode]}' 방식을 지원하지 않습니다.`);
  if (!m.resolutions.includes(o.resolution)) errs.push(`${m.label} 해상도는 ${m.resolutions.join("·")} 중 하나입니다.`);
  if (!m.aspects.includes(o.aspect)) errs.push(`${m.label} 은 ${o.aspect} 비율을 지원하지 않습니다.`);
  if (o.mode === "multi_shot") {
    const ms = m.multiShot!;
    const shots = o.shotSecs ?? [];
    if (!ms) errs.push(`${m.label} 은 여러 장면 순서대로 만들기를 지원하지 않습니다.`);
    else {
      if (refs.scenes < 2) errs.push("여러 장면 묶음은 장면을 2개 이상 골라 주세요.");
      if (refs.scenes > ms.maxShots) errs.push(`${m.label} 멀티 샷은 한 번에 최대 ${ms.maxShots}장면입니다.`);
      if (shots.length !== refs.scenes) errs.push("장면마다 길이를 정해 주세요.");
      if (shots.some((s) => s < ms.minShotSec || s > ms.maxShotSec || !Number.isInteger(s))) errs.push(`컷 길이는 ${ms.minShotSec}~${ms.maxShotSec}초 (정수)입니다.`);
      const total = shots.reduce((a, b) => a + b, 0);
      if (total < m.minSec || total > m.maxSec) errs.push(`멀티 샷 전체 길이(${total}초)는 ${m.minSec}~${m.maxSec}초여야 합니다.`);
    }
  } else if (m.durations && !m.durations.includes(o.durationSec)) {
    errs.push(`${m.label} 길이는 ${m.durations.join("·")}초 중 하나입니다 (지금 ${o.durationSec}초).`);
  } else if (!Number.isInteger(o.durationSec) || o.durationSec < m.minSec || o.durationSec > m.maxSec) {
    errs.push(`${m.label} 은 한 번에 ${m.minSec}~${m.maxSec}초까지 만들 수 있습니다 (지금 ${o.durationSec}초). 더 길면 장면을 나눠 만든 뒤 이어 붙여 주세요.`);
  }
  if (o.mode === "first_frame" && !refs.first) errs.push("첫 프레임으로 쓸 스토리보드 이미지가 없습니다.");
  if (o.mode === "first_last" && (!refs.first || !refs.last)) errs.push("첫 프레임과 끝 프레임 이미지가 모두 필요합니다.");
  if (o.mode === "first_last" && !m.supportsLastFrame) errs.push(`${m.label} 은 끝 프레임을 지원하지 않습니다.`);
  if (o.mode === "reference" && refs.references < 1) errs.push("참고 이미지가 1장 이상 필요합니다 (승인한 스토리보드·캐릭터 기준 이미지).");
  if (o.mode === "reference" && refs.references > m.maxReferenceImages) errs.push(`${m.label} 참고 이미지는 최대 ${m.maxReferenceImages}장입니다 (지금 ${refs.references}장).`);
  if (o.mode !== "multi_shot" && refs.scenes > 1 && o.mode !== "reference") errs.push("여러 장면을 한 번에 만들려면 '참고 이미지' 또는 '여러 장면 순서대로(멀티 샷)' 방식을 골라 주세요.");
  if (m.audio === "none" && o.audio) errs.push(`${m.label} 은 소리를 만들지 않습니다.`);
  return errs;
}

/** 여러 장면을 '참고 이미지' 하나로 묶을 때: 순서·컷 전환을 보장하지 않는다 */
export const multiSceneCaveat = (o: VideoOptions, scenes: number) => (scenes > 1 && o.mode === "reference" ? "이 모델은 여러 이미지를 외형 참고로만 씁니다. 장면 순서와 컷 전환을 보장하지 않습니다." : null);

/** 최소 예상 크레딧 (공개 최소 단가 × 길이). null = 가격 확인 안 됨 */
export function estimateVideoCredits(o: VideoOptions): number | null {
  const m = videoModel(o.modelId);
  if (!m?.minCreditsPerSec) return null;
  const sec = o.mode === "multi_shot" ? (o.shotSecs ?? []).reduce((a, b) => a + b, 0) : o.durationSec;
  return Math.round((m.creditsPerSecByRes?.[o.resolution] ?? m.minCreditsPerSec) * sec);
}

export const estimateImageCredits = (modelId: string, count: number) => {
  const m = imageModel(modelId);
  return m?.minCreditsPerImage ? m.minCreditsPerImage * count : null;
};

/**
 * Kie 영상 요청 input 만들기 (서버). 이미지 주소는 서버가 Storage 서명 주소로 넣는다.
 * 방식마다 한 가지 입력만 넣는다 (first_frame_url·last_frame_url 과 reference_image_urls 를 같이 보내지 않음).
 */
export function buildVideoInput(
  o: VideoOptions,
  x: {
    prompt: string;
    firstUrl?: string | null;
    lastUrl?: string | null;
    referenceUrls?: string[];
    shots?: { prompt: string; durationSec: number }[];
    elements?: { name: string; description: string; urls: string[] }[];
  },
): Record<string, unknown> {
  const m = videoModel(o.modelId);
  if (!m) throw new Error("지원하지 않는 영상 모델입니다.");
  if (m.family === "seedance") {
    const base: Record<string, unknown> = { prompt: x.prompt.slice(0, 20000), resolution: o.resolution, aspect_ratio: o.aspect, duration: o.durationSec, generate_audio: o.audio };
    if (o.mode === "first_frame") base.first_frame_url = x.firstUrl;
    if (o.mode === "first_last") Object.assign(base, { first_frame_url: x.firstUrl, last_frame_url: x.lastUrl });
    if (o.mode === "reference") base.reference_image_urls = (x.referenceUrls ?? []).slice(0, m.maxReferenceImages);
    return base;
  }
  if (m.family === "kling") {
    const base: Record<string, unknown> = { sound: o.audio, mode: o.resolution, aspect_ratio: o.aspect };
    if (o.mode === "multi_shot") {
      const shots = x.shots ?? [];
      Object.assign(base, {
        multi_shots: true,
        multi_prompt: shots.map((s) => ({ prompt: s.prompt.slice(0, 500), duration: s.durationSec })),
        duration: String(shots.reduce((a, s) => a + s.durationSec, 0)),
      });
      // 멀티 샷은 첫 프레임만 받는다
      if (x.firstUrl) base.image_urls = [x.firstUrl];
      return base;
    }
    Object.assign(base, { multi_shots: false, prompt: x.prompt.slice(0, 2500), duration: String(o.durationSec) });
    if (o.mode === "first_frame") base.image_urls = [x.firstUrl];
    if (o.mode === "first_last") base.image_urls = [x.firstUrl, x.lastUrl];
    if (o.mode === "reference") base.kling_elements = (x.elements ?? []).slice(0, 3).map((e) => ({ name: e.name, description: e.description.slice(0, 100), element_input_urls: e.urls.slice(0, 4) }));
    return base;
  }
  if (m.family === "veo") {
    const base: Record<string, unknown> = { model: m.subModel, prompt: x.prompt.slice(0, 5000), aspect_ratio: o.aspect, duration: o.durationSec, resolution: o.resolution };
    if (o.mode === "first_frame") Object.assign(base, { generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: [x.firstUrl] });
    else if (o.mode === "first_last") Object.assign(base, { generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: [x.firstUrl, x.lastUrl] });
    else base.generation_type = "TEXT_2_VIDEO";
    return base;
  }
  if (m.family === "grok") {
    const base: Record<string, unknown> = { prompt: x.prompt.slice(0, 4096), aspect_ratio: o.aspect, resolution: o.resolution, duration: o.durationSec };
    if (o.mode === "first_frame") base.first_frame_url = x.firstUrl;
    if (o.mode === "first_last") Object.assign(base, { first_frame_url: x.firstUrl, last_frame_url: x.lastUrl });
    if (o.mode === "reference") base.image_urls = (x.referenceUrls ?? []).slice(0, 1);
    return base;
  }
  if (m.family === "pixverse") {
    const base: Record<string, unknown> = { prompt: x.prompt.slice(0, 5000), quality: o.resolution, duration: o.durationSec, generate_audio_switch: o.audio };
    // 이미지→영상은 비율이 이미지를 따라가 aspect_ratio 를 보내지 않는다
    if (o.mode === "first_frame") base.image_urls = [x.firstUrl];
    else base.aspect_ratio = o.aspect;
    return base;
  }
  // MiniMax H3 reference-to-video
  return { prompt: x.prompt.slice(0, 7000), reference_image_urls: (x.referenceUrls ?? []).slice(0, m.maxReferenceImages), aspect_ratio: o.aspect, duration: o.durationSec, resolution: o.resolution };
}

/** 서로 배타적인 입력이 섞였는지 (요청을 보내기 전 마지막 확인) */
export function hasConflictingInputs(input: Record<string, unknown>): boolean {
  const frame = "first_frame_url" in input || "last_frame_url" in input;
  const ref = ["reference_image_urls", "reference_video_urls", "reference_audio_urls"].some((k) => k in input);
  const klingFrame = "image_urls" in input && !input.multi_shots;
  const klingRef = "kling_elements" in input;
  return (frame && ref) || (klingFrame && klingRef);
}
