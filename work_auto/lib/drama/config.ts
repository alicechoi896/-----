/**
 * AI 드라마 시험 (v0.9.62) — 화면·서버 공용 설정. docs/DRAMA_TEST.md
 * 같은 인물(참고 사진)·같은 장면을 여러 모델로 만들어 인물 유지·한국어 대사·움직임을 비교한다.
 * 가격은 kie.ai 모델 페이지 기준 (2026-10-22, 1크레딧 = $0.005). 실제 크레딧은 끝난 뒤 표시.
 */
export type DramaModelId = "minimax-h3" | "seedance-mini" | "kling3";

export const DRAMA_MODELS: { id: DramaModelId; label: string; model: string; creditsPerSec: number; note: string }[] = [
  { id: "minimax-h3", label: "MiniMax H3", model: "minimax-h3/reference-to-video", creditsPerSec: 8, note: "참고 사진 9장(5장까지 무료) · 768P · 소리 항상" },
  { id: "seedance-mini", label: "Seedance 2.0 Mini", model: "bytedance/seedance-2-mini", creditsPerSec: 8.2, note: "참고 사진 9장 · 720p · 소리 켬" },
  { id: "kling3", label: "Kling 3.0", model: "kling-3.0/video", creditsPerSec: 20, note: "인물 요소(사진 2장씩) · 720p · 소리 켬 · 한국어 대사 지원" },
];

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
