/**
 * 영상 검색 공통 모델 (샤오홍슈·도우인). 화면은 업체 원본 응답을 직접 쓰지 않는다. docs/SOCIAL_VIDEO_SOURCING.md
 * 업체 응답에 없는 값은 null — 만들어 넣지 않는다.
 */
export type SocialPlatform = "xiaohongshu" | "douyin";
/** 어떤 검색어로 찾았는지: 입력 그대로 / AI 변환 1순위 / 보조 / 영어 */
export type SocialQueryType = "original" | "primary" | "alternate" | "english";

export interface SocialVideoItem {
  platform: SocialPlatform;
  sourceId: string;
  title: string;
  desc: string | null;
  authorName: string | null;
  thumbnailUrl: string | null;
  /** 기존 영상 가져오기에 그대로 넘길 원본(공유) 주소 */
  originalUrl: string;
  publishedAt: string | null;
  durationSec: number | null;
  likeCount: number | null;
  commentCount: number | null;
  collectCount: number | null;
  shareCount: number | null;
  matchedQuery: string;
  queryType: SocialQueryType;
  /** 다른 플랫폼에 비슷한 영상이 있으면 같은 값 (자동으로 지우지 않고 표시만) */
  similarGroup: string | null;
}

export interface SocialQueryTranslation {
  original: string;
  primaryZh: string | null;
  alternateZh: string | null;
  english: string | null;
  /** AI 변환을 했는지 (중국어·영어 입력, 끈 경우는 false) */
  translated: boolean;
}

export type SocialSortOption = "general" | "latest" | "likes" | "comments" | "collects";
export type SocialPeriodOption = "7" | "21" | "30" | "all";

/** 이어서 더 보기 (플랫폼별) */
export interface SocialContinue {
  query: string;
  queryType: SocialQueryType;
  page?: number;
  cursor?: number;
  searchId?: string;
  sessionId?: string;
  backtrace?: string;
}

export interface SocialPlatformResult {
  platform: SocialPlatform;
  items: SocialVideoItem[];
  /** 이 플랫폼만 실패해도 다른 플랫폼 결과는 그대로 */
  error: { code: string; message: string } | null;
  /** 이번에 TikHub 를 부른 횟수 */
  calls: number;
  queriesUsed: { query: string; type: SocialQueryType; count: number }[];
  next: SocialContinue | null;
}

export interface SocialSearchResultDto {
  translation: SocialQueryTranslation;
  /** 자동 변환 실패 (원문으로 검색함) */
  translationError: string | null;
  platforms: SocialPlatformResult[];
}
