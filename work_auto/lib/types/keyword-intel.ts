/**
 * Keyword Intelligence (v0.9.40) — 실제 플랫폼 데이터로 모은 키워드 후보. docs/KEYWORD_INTELLIGENCE.md
 * 최종 콘텐츠가 아니라 1단계(제목·Hook·CTA)와 2단계(최종 키워드·태그)의 참고 Context 다.
 * 검색량·SEO 점수처럼 API 가 주지 않는 값은 만들지 않는다 (NAVER 데이터랩 = 상대 관심도).
 */
export type KeywordSource = "youtube" | "naver" | "fallback_ai";

export interface KeywordCandidate {
  keyword: string;
  source: Exclude<KeywordSource, "fallback_ai">;
  /** 근거: 예) "관련 영상 25개 중 제목 6·태그 4" */
  evidence: string;
  /** 정렬용 상대 점수 (0~100, 같은 조회 안에서만 의미) */
  score: number;
}

export interface KeywordTrendSignal {
  keyword: string;
  /** 데이터랩 상대 관심도 평균 (0~100, 검색량 아님) */
  relativeInterest: number;
  direction: "up" | "flat" | "down";
}

export interface KeywordIntelligence {
  seed: string;
  source: KeywordSource;
  /** 분석한 영상·글 수 */
  sampleSize: number;
  candidates: KeywordCandidate[];
  trendSignals: KeywordTrendSignal[];
  fetchedAt: string;
  /** 실패·대체 사유 등 */
  note?: string;
}
