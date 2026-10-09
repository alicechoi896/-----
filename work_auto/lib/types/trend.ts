import type { ID, ISODate } from "./common";
import type { TrendScope } from "./profile";

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
  /** 콘텐츠 프로필 ID. 비우면 기본 프로필 자동 적용, "none" 이면 프로필 없이 */
  profileId?: string;
  /** 서버가 프로필에서 풀어 넣는 조사 범위 (클라이언트가 보내지 않는다) */
  scope?: TrendScope | null;
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
  params: Omit<YouTubeTrendQuery, "pageToken" | "profileId" | "scope">;
  /** 화면을 열 때 자동으로 적용, 생성 화면 "참고 트렌드" 기준 */
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** 찜한 트렌드 영상 (생성 화면 "참고 트렌드"에 먼저 나온다) */
/** 트렌드 스크랩 (v0.9.54): YouTube 찜 + NAVER 트렌드 주제 + 인스타그램 릴스. saved_trends 테이블 */
export type ScrapSource = "youtube" | "naver" | "instagram";

export interface SavedTrend {
  id: ID;
  userId: ID;
  source: ScrapSource;
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
  publishedAt: ISODate | null;
  /** AI 분석 결과 등 부가 정보 */
  analysis: YouTubeVideoAnalysis | null;
  /** 스크랩 분류 (폴더 이름, '' = 분류 없음) */
  folder?: string;
  /** 출처별 부가 정보 (좋아요·댓글·캡션·작성자·NAVER 범위 등) */
  meta?: Record<string, unknown>;
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

/** NAVER 트렌드 기간(일): 7일 ~ 3년 */
/** 21 은 콘텐츠 프로필의 기본 분석기간 선택지 (7·14·21·30·90) 와 맞추기 위해 있다 */
export const NAVER_PERIODS = [7, 14, 21, 30, 90, 180, 365, 730, 1095] as const;
export type NaverPeriod = (typeof NAVER_PERIODS)[number];

export interface NaverTrendQuery {
  /** 콘텐츠 프로필이 없을 때 쓰는 기본 카테고리 (데모 데이터) */
  category?: string;
  keyword?: string;
  periodDays: NaverPeriod;
  /** 사용하는 화면 (clip | blog). 결과 구성이 조금 다르다 */
  scope: "clip" | "blog";
  /** 콘텐츠 프로필 ID. 비우면 기본 프로필 자동 적용, "none" 이면 프로필 없이 */
  profileId?: string;
  /** 서버가 프로필에서 풀어 넣는 조사 범위 ("무엇을 조사할지"). NAVER 분석 방식은 Provider 가 따로 정한다 */
  profileScope?: TrendScope | null;
}

/** 검색어 하나의 검색 지표 (검색광고 API · 블로그 검색 API) */
export interface NaverKeywordStats {
  keyword: string;
  /** 월간 검색량 (PC + 모바일). 검색광고 키가 없으면 null */
  monthlyPc: number | null;
  monthlyMobile: number | null;
  competition: "low" | "mid" | "high" | null;
  /** 블로그 누적 문서 수 (발행량 지표). 검색 API 권한이 없으면 null */
  blogDocCount: number | null;
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
  /** 검색 추이가 무엇의 추이인지 (검색어, 또는 "가전 콘텐츠 전체") */
  searchTrendLabel?: string;
  contentIdeas: string[];
  /** 검색어의 검색량·문서 수 (검색어가 있을 때) */
  keywordStats?: NaverKeywordStats | null;
  /** 데이터 출처: 실제 NAVER API / 데모 */
  dataSource?: "live" | "mock";
  /** 일부 데이터를 못 가져온 이유 등 안내 */
  notes?: string[];
  /** 더 불러올 수 있는 목록 (10개씩, [더보기]를 누를 때 서버가 그때 더 계산한다) */
  more?: { rising: boolean; related: boolean; ideas: boolean };
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

/** NAVER 트렌드 [더보기] (10개씩) */
export type NaverTrendSection = "rising" | "related" | "ideas";
export interface NaverTrendMore {
  section: NaverTrendSection;
  /** rising: 급상승 키워드와 급상승 주제를 함께 늘린다 */
  risingKeywords?: Keyword[];
  risingTopics?: NaverRisingTopic[];
  relatedKeywords?: Keyword[];
  contentIdeas?: string[];
  hasMore: boolean;
}
