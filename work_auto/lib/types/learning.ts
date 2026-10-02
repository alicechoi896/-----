import type { ID, ISODate } from "./common";

/**
 * 학습 프로필 (learning_profiles) — 팀 공통, 채널·유형별 1개 (docs/INCREMENTAL_LEARNING.md).
 * 생성 결과에 대한 피드백·직접 수정·선택한 제목·업로드 완료·성과를 모아
 * 아주 작은 요약(Insight)으로 압축해 두고, 다음 생성에 "경향"으로 참고한다. Fine-tuning 이 아니다.
 */

export const LEARNING_CATEGORIES = [
  "title_insights",
  "hook_insights",
  "structure_insights",
  "cta_insights",
  "keyword_insights",
  "positive_traits",
  "negative_traits",
  "style_adjustments",
] as const;
export type LearningCategory = (typeof LEARNING_CATEGORIES)[number];

export interface LearningInsight {
  text: string;
  /** 이 경향을 뒷받침한 콘텐츠 수 */
  support_count: number;
  positive_count: number;
  negative_count: number;
  /** 0~1 */
  confidence: number;
  last_seen_at: ISODate;
}

export type LearningSummary = Partial<Record<LearningCategory, LearningInsight[]>>;

/** 학습 프로필 묶음: 블로그 자동 글쓰기는 정보글과 합친다 */
export type LearningContentType = "product" | "info";

export interface LearningProfile {
  /** "{channelId}:{contentType}" (팀 공통이라 고정 ID) */
  id: ID;
  channelId: string;
  contentType: LearningContentType;
  summaryJson: LearningSummary;
  /** 직전 버전 1개 (되돌리기용) */
  previousSummaryJson: LearningSummary | null;
  version: number;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  /** 사용자별 마지막 반영 시각. 공통 프로필이지만 각자 자기 콘텐츠만 읽을 수 있어서(RLS) 사람마다 따로 센다 */
  userCursors: Record<string, ISODate>;
  lastProcessedAt: ISODate | null;
  lastError: string | null;
  updatedBy: ID | null;
  updatedByName: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** 화면용: 내 새 학습 데이터 수 함께 */
export type LearningProfileView = LearningProfile & { label: string; myPending: number; threshold: number };
