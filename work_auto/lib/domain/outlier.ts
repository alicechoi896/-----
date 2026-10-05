/**
 * 아웃라이어 점수 (화면·서버 공용, v0.9.34). docs/OUTLIER_SCORE.md
 *  점수 = 이 영상 조회수 ÷ 같은 채널 최근 영상 15개 조회수의 중앙값
 *  구독자가 많아 원래 조회수가 높은 채널과, 내용이 좋아 평소보다 터진 영상을 구분한다.
 */
export const OUTLIER_CONFIG = {
  /** 채널마다 비교할 최근 영상 수 */
  recentCount: 15,
  /** 이 배수 이상이면 '터진 영상' */
  hitRatio: 3,
  /** 중앙값을 믿을 최소 영상 수 (이보다 적으면 점수 없음) */
  minSample: 5,
} as const;

export interface OutlierScore {
  /** 조회수 ÷ 채널 중앙값 (소수 1자리) */
  score: number;
  /** 채널 최근 영상 조회수 중앙값 */
  median: number;
  /** 중앙값에 쓴 영상 수 */
  sample: number;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** 점수 계산 (중앙값 0 이거나 표본이 적으면 null) */
export function outlierScore(views: number, recentViews: number[]): OutlierScore | null {
  const sample = recentViews.filter((x) => Number.isFinite(x) && x >= 0);
  if (sample.length < OUTLIER_CONFIG.minSample) return null;
  const m = median(sample);
  if (!m) return null;
  return { score: Math.round((views / m) * 10) / 10, median: Math.round(m), sample: sample.length };
}

export const isOutlierHit = (s: OutlierScore | null | undefined) => Boolean(s && s.score >= OUTLIER_CONFIG.hitRatio);
