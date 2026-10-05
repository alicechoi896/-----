/**
 * 영상 검색 공통 모델 (샤오홍슈·도우인). 화면은 업체 원본 응답을 직접 쓰지 않는다. docs/SOCIAL_VIDEO_SOURCING.md
 * 업체 응답에 없는 값은 null — 만들어 넣지 않는다. 검색 결과는 저장하지 않는다 (화면·세션 기억만).
 */
export type SocialPlatform = "xiaohongshu" | "douyin";
/** 어떤 검색어로 찾았는지: 입력 그대로 / AI 가 바꾼 중국어 */
export type SocialQueryType = "original" | "translated";

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
  /**
   * 검색 응답에 이미 있는 재생 주소 (카드 안 미리보기용). 없으면 null → ▶ 를 누를 때만 그 영상 1개를 찾는다.
   * 만료될 수 있어 DB 에 저장하지 않는다 (화면 세션에서만 짧게).
   */
  previewUrl: string | null;
}

export interface SocialQueryTranslation {
  original: string;
  /** 실제로 검색한 말 (변환했으면 중국어, 아니면 입력 그대로) */
  query: string;
  /** AI 변환을 했는지 (중국어·영어 입력, 끈 경우는 false) */
  translated: boolean;
}

export type SocialSortOption = "general" | "latest" | "likes" | "comments" | "collects";
export type SocialPeriodOption = "7" | "21" | "30" | "all";

/** [더 보기] 이어서 부를 위치 (플랫폼이 준 값 그대로) */
export interface SocialContinue {
  query: string;
  queryType: SocialQueryType;
  page?: number;
  cursor?: number;
  searchId?: string;
  sessionId?: string;
  backtrace?: string;
}

export interface SocialSearchResultDto {
  platform: SocialPlatform;
  translation: SocialQueryTranslation;
  /** 자동 변환 실패 (원문으로 검색함) */
  translationError: string | null;
  items: SocialVideoItem[];
  /** 이번 요청에서 TikHub 를 부른 횟수 (기억된 결과면 0) */
  calls: number;
  /** 다음 결과가 있으면 [더 보기] 위치, 없으면 null */
  next: SocialContinue | null;
  /** 21·30일: 업체 필터가 없어 반년으로 받은 뒤 게시일로 거른 경우 */
  filteredByDate: boolean;
}
