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
}

export interface YouTubeTrendQuery {
  category?: string;
  keyword?: string;
  periodDays: TrendPeriod;
  format?: "all" | "shorts" | "long";
  sort?: "trendScore" | "views" | "viewsPerDay" | "publishedAt";
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
}
