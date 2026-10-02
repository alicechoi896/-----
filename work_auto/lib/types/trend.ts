import type { ID, ISODate } from "./common";

export type TrendSource = "youtube" | "naver";
export type TrendPeriod = 7 | 14 | 21 | 30;

/** 키워드 (트렌드, 생성 결과, 제품 분석에서 공통으로 사용) */
export interface Keyword {
  text: string;
  source: TrendSource | "ai" | "user";
  /** 월간 검색량 등 (Provider별 의미가 다를 수 있음) */
  volume?: number;
  /** 직전 기간 대비 증가율 (%) */
  growthRate?: number;
  competition?: "low" | "mid" | "high";
}

/** 모든 트렌드 항목의 공통 필드 */
export interface TrendItemBase {
  id: ID;
  source: TrendSource;
  title: string;
  category: string;
  keywords: string[];
  /** 0~100 정규화 점수 (lib/domain/trend-score.ts) */
  trendScore: number;
  collectedAt: ISODate;
}

export interface YouTubeTrendItem extends TrendItemBase {
  source: "youtube";
  videoId: string;
  url: string;
  channelId: string;
  channelName: string;
  channelSubscribers: number;
  /** 썸네일이 없을 때(Mock) 쓰는 배경색 */
  thumbnailColor: string;
  /** 실제 썸네일 이미지 URL (YouTube Data API) */
  thumbnailUrl?: string;
  publishedAt: ISODate;
  durationSec: number;
  format: "shorts" | "long";
  views: number;
  viewsPerDay: number;
  /** 댓글 수 (채널이 숨기면 null) */
  commentCount: number | null;
  likeCount: number | null;
  /** 업로더가 단 태그 전체 */
  tags: string[];
  /** 설명 앞부분 (AI 분석용, 최대 500자) */
  description: string;
  /** 조회한 국가 코드 (예: KR) */
  country: string;
}

/** YouTube 트렌드 조회 조건 (조건 저장의 params 와 같은 형태) */
export interface YouTubeTrendQuery {
  /** 국가 코드 (KR, US, JP …). 기본 KR */
  country: string;
  /** YouTube 공식 카테고리 ID (예: "28" 과학기술). 비우면 전체 */
  categoryId?: string;
  keyword?: string;
  /** 게시일 범위 (YYYY-MM-DD) */
  publishedFrom: string;
  publishedTo?: string;
  /** "최근 N일" 버튼으로 고른 경우 N. 저장한 조건을 다시 쓸 때 오늘 기준으로 날짜를 다시 계산한다 */
  recentDays?: number;
  format?: "all" | "shorts" | "long";
  minSubscribers?: number;
  maxSubscribers?: number;
  minViews?: number;
  maxViews?: number;
  minComments?: number;
  /** 다음 50개를 불러올 때 쓰는 페이지 토큰 */
  pageToken?: string;
}

export interface YouTubeTrendPage {
  items: YouTubeTrendItem[];
  /** 더 불러올 수 있으면 다음 페이지 토큰 */
  nextPageToken: string | null;
  /** 이번 페이지에서 YouTube 가 돌려준 영상 수 (조건 필터 전) */
  fetched: number;
}

/** 저장한 조회 조건 (사용자별) */
export interface SavedFilter {
  id: ID;
  userId: ID;
  kind: "youtube-trend";
  name: string;
  params: Omit<YouTubeTrendQuery, "pageToken">;
  /** 화면을 열 때 자동으로 적용, 생성 화면 "참고 트렌드" 기준 */
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** 찜한 트렌드 영상 (생성 화면 "참고 트렌드"에 먼저 나온다) */
export interface SavedTrend {
  id: ID;
  userId: ID;
  source: "youtube";
  /** 트렌드 항목 ID (yt_{videoId}) — 생성 화면 "참고 트렌드" 값 */
  trendId: ID;
  videoId: string;
  title: string;
  format: "shorts" | "long";
  url: string;
  channelName: string;
  thumbnailUrl: string | null;
  keywords: string[];
  tags: string[];
  views: number;
  publishedAt: ISODate;
  /** AI 분석 결과 등 부가 정보 */
  analysis: YouTubeVideoAnalysis | null;
  createdAt: ISODate;
}

/** 영상 AI 분석 결과 */
export interface YouTubeVideoAnalysis {
  reasons: string[];
  titleSuggestions: string[];
  keywords: string[];
}

/** AI 추천 영상 주제 */
export interface YouTubeTopicSuggestion {
  title: string;
  angle: string;
  keywords: string[];
  format: "shorts" | "long";
}

export interface NaverTrendQuery {
  category?: string;
  keyword?: string;
  periodDays: TrendPeriod;
  /** 사용하는 화면 (clip | blog). 결과 구성이 조금 다르다 */
  scope: "clip" | "blog";
}

export interface NaverRisingTopic extends TrendItemBase {
  source: "naver";
  description: string;
  growthRate: number;
}

export interface NaverTrendInsight {
  query: NaverTrendQuery;
  risingTopics: NaverRisingTopic[];
  risingKeywords: Keyword[];
  seasonalKeywords: Keyword[];
  relatedKeywords: Keyword[];
  /** 최근 검색 추이 (상대값 0~100) */
  searchTrend: { date: string; value: number }[];
  contentIdeas: string[];
  collectedAt: ISODate;
}

/** 생성 폼에서 "트렌드 선택"에 쓰는 가벼운 형태 */
export interface TrendOption {
  id: ID;
  source: TrendSource;
  title: string;
  keywords: string[];
  /** 선택 목록의 묶음 이름 (예: "찜한 영상", "기본 조건 결과") */
  group?: string;
}
