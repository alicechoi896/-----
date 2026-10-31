/**
 * AI 드라마 시험 (v0.9.62) — 화면·서버 공용 설정. docs/DRAMA_TEST.md
 * 같은 인물(참고 사진)·같은 장면을 여러 모델로 만들어 인물 유지·한국어 대사·움직임을 비교한다.
 * 가격은 kie.ai 모델 페이지 기준 (2026-10-22, 1크레딧 = $0.005). 실제 크레딧은 끝난 뒤 표시.
 */
export type DramaModelId = "minimax-h3" | "seedance-mini" | "seedance-fast" | "kling3" | "veo-lite" | "grok-15" | "pixverse-v6max";

/**
 * 인물을 넣는 방식: ref = 인물 사진을 참고 이미지로 (여러 명) / element = Kling 인물 요소 /
 * first = 참고 이미지를 받지 않는 모델 — 첫 번째 인물 사진을 '시작 화면'으로 (그 사진에서 장면이 시작된다)
 * v0.9.115: Seedance 2.0 Fast · Veo 3.1 Lite · Grok Imagine Video 1.5 · PixVerse V6 Max 추가 (docs.kie.ai 2026-11-01 확인)
 */
export const DRAMA_MODELS: { id: DramaModelId; label: string; model: string; creditsPerSec: number; cast: "ref" | "element" | "first"; maxSec: number; note: string; priceKnown: boolean }[] = [
  { id: "minimax-h3", label: "MiniMax H3", model: "minimax-h3/reference-to-video", creditsPerSec: 8, cast: "ref", maxSec: 15, note: "참고 사진 9장(5장까지 무료) · 768P · 소리 항상 · 최대 15초", priceKnown: true },
  { id: "seedance-mini", label: "Seedance 2.0 Mini", model: "bytedance/seedance-2-mini", creditsPerSec: 8.2, cast: "ref", maxSec: 15, note: "참고 사진 9장 · 720p · 소리 켬 · 최대 15초", priceKnown: true },
  { id: "seedance-fast", label: "Seedance 2.0 Fast", model: "bytedance/seedance-2-fast", creditsPerSec: 6.8, cast: "ref", maxSec: 15, note: "참고 사진 9장 · 720p · 소리 켬 · 최대 15초 (가격은 '부터' 값)", priceKnown: true },
  { id: "kling3", label: "Kling 3.0", model: "kling-3.0/video", creditsPerSec: 20, cast: "element", maxSec: 15, note: "인물 요소(사진 2장씩) · 720p · 소리 켬 · 한국어 대사 지원 · 최대 15초", priceKnown: true },
  { id: "grok-15", label: "Grok Imagine Video 1.5", model: "grok-imagine-video-1-5-preview", creditsPerSec: 2.4, cast: "first", maxSec: 15, note: "참고 사진 1장만 → 첫 인물 사진을 시작 화면으로 · 720p · 소리 항상 · 최대 15초 (가격은 '부터' 값)", priceKnown: true },
  { id: "pixverse-v6max", label: "PixVerse V6 Max", model: "pixverse-v6-max/image-to-video", creditsPerSec: 12, cast: "first", maxSec: 15, note: "참고 사진 없음 → 첫 인물 사진을 시작 화면으로 · 720p · 소리 켬 · 최대 15초", priceKnown: true },
];
/** 처음에 골라 두는 모델 (예전과 같은 3개 — 새 모델은 직접 골라서 비교) */
export const DEFAULT_DRAMA_MODELS: DramaModelId[] = ["minimax-h3", "seedance-mini", "kling3"];

export const DRAMA_LIMITS = {
  characters: 3,
  scenes: 5,
  /** 장면 1개 길이 (초) */
  durationSec: 8,
  dialogueLines: 6,
  creditUsd: 0.005,
  /** 브라우저에서 줄여 올리는 사진 크기 (긴 쪽) */
  imageMaxSide: 1536,
} as const;

export function dramaCostUsd(models: DramaModelId[], scenes: number): number {
  const perScene = models.reduce((n, id) => n + (DRAMA_MODELS.find((m) => m.id === id)?.creditsPerSec ?? 0) * DRAMA_LIMITS.durationSec, 0);
  return Number((perScene * scenes * DRAMA_LIMITS.creditUsd).toFixed(2));
}
