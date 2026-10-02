import type { LearningContentType } from "@/lib/types";

/**
 * Incremental Learning 설정 (docs/INCREMENTAL_LEARNING.md). 숫자는 여기서만 바꾼다.
 */
export const learningConfig = {
  /** 새 학습 신호가 이만큼 쌓이면 자동으로 학습 프로필을 업데이트한다 */
  updateThreshold: 10,
  /** 한 번 업데이트에 보내는 최대 콘텐츠 수 (요약본) */
  maxSamplesPerUpdate: 15,
  /** 항목(카테고리)별 Insight 최대 개수 */
  maxInsightsPerCategory: 10,
  /** 생성 프롬프트에 넣는 조건: 근거 콘텐츠 수 이상 · confidence 이상 */
  minSupportForPrompt: 2,
  minConfidenceForPrompt: 0.35,
  /** 생성 프롬프트에 넣는 학습 프로필 최대 글자 수 */
  promptCharLimit: 1500,
  /** 기간별 가중치 (성과·피드백의 최근성). 일 단위 경계 */
  recency: { recentDays: 30, midDays: 90, recentWeight: 1, midTermWeight: 0.6, oldWeight: 0.3 },
  /** 좋은 예시: 긍정 결과 최대 3 + 일반 1, 최근 10번 생성에 쓴 예시는 덜 고른다 */
  examples: { positive: 3, general: 1, recentWindow: 10, recentPenalty: 0.3, maxCharsEach: 450 },
} as const;

/** 생성 기능 → 학습 프로필 (채널·유형). 블로그 자동 글쓰기는 정보글과 합친다 */
export const LEARNING_PROFILE_OF: Record<string, { channelId: string; contentType: LearningContentType }> = {
  "yt-product-video": { channelId: "youtube", contentType: "product" },
  "yt-info-video": { channelId: "youtube", contentType: "info" },
  "clip-product-content": { channelId: "naver-clip", contentType: "product" },
  "clip-info-content": { channelId: "naver-clip", contentType: "info" },
  "blog-product-writing": { channelId: "naver-blog", contentType: "product" },
  "blog-info-writing": { channelId: "naver-blog", contentType: "info" },
  "blog-auto-writing": { channelId: "naver-blog", contentType: "info" },
};

export const LEARNING_PROFILES = [
  { channelId: "youtube", contentType: "product", label: "YouTube 제품 영상" },
  { channelId: "youtube", contentType: "info", label: "YouTube 정보성 영상" },
  { channelId: "naver-clip", contentType: "product", label: "NAVER 클립 제품" },
  { channelId: "naver-clip", contentType: "info", label: "NAVER 클립 정보성" },
  { channelId: "naver-blog", contentType: "product", label: "NAVER 블로그 제품 글" },
  { channelId: "naver-blog", contentType: "info", label: "NAVER 블로그 정보·자동 글" },
] as const;

export const learningProfileId = (channelId: string, contentType: string) => `${channelId}:${contentType}`;

export const LEARNING_CATEGORY_LABEL: Record<string, string> = {
  title_insights: "제목 경향",
  hook_insights: "Hook 경향",
  structure_insights: "대본·글 구조",
  cta_insights: "CTA",
  keyword_insights: "키워드",
  positive_traits: "좋은 특징",
  negative_traits: "피해야 할 특징",
  style_adjustments: "표현 조정",
};
