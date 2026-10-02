/**
 * Trend Score (0~100) — YouTube 트렌드 정렬 기준.
 * 산식을 바꾸면 docs/PRD.md 7.2 와 docs/FEATURE_REGISTRY.md 를 함께 갱신한다.
 *
 *   score = 조회 속도 50% + 구독자 대비 조회 비율 30% + 최근성 20%
 *
 * 각 항목은 로그 스케일로 0~1 로 정규화한다. (조회수 분포는 롱테일이기 때문)
 */

export interface TrendScoreInput {
  views: number;
  viewsPerDay: number;
  channelSubscribers: number;
  /** 게시 후 경과 일수 */
  ageDays: number;
  /** 조회 기간 (7/14/21/30) */
  periodDays: number;
}

export const TREND_SCORE_WEIGHTS = { velocity: 0.5, outlier: 0.3, recency: 0.2 } as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function calcTrendScore({ views, viewsPerDay, channelSubscribers, ageDays, periodDays }: TrendScoreInput): number {
  // 1) 조회 속도: 일 1천 회 = 0, 일 100만 회 = 1
  const velocity = clamp01((Math.log10(Math.max(viewsPerDay, 1)) - 3) / 3);
  // 2) 구독자 대비 조회 비율: 0.1배 = 0, 10배 이상 = 1 (작은 채널의 급성장 영상을 찾기 위함)
  const ratio = views / Math.max(channelSubscribers, 1);
  const outlier = clamp01((Math.log10(Math.max(ratio, 0.01)) + 1) / 2);
  // 3) 최근성: 오늘 = 1, 기간 끝 = 0
  const recency = clamp01(1 - ageDays / Math.max(periodDays, 1));

  const score =
    velocity * TREND_SCORE_WEIGHTS.velocity + outlier * TREND_SCORE_WEIGHTS.outlier + recency * TREND_SCORE_WEIGHTS.recency;
  return Math.round(score * 100);
}

/** 점수 구간 → 표시 등급 */
export function trendScoreLevel(score: number): "hot" | "rising" | "normal" {
  if (score >= 75) return "hot";
  if (score >= 55) return "rising";
  return "normal";
}
