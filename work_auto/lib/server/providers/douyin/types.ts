import "server-only";
import type { BaseProvider } from "../types";

/**
 * 도우인 Provider (docs/SOCIAL_VIDEO_SOURCING.md). 화면·서비스는 이 interface 만 쓴다 (업체 교체 대비)
 */
export type DouyinSort = "general" | "likes" | "latest";
/** 업체 기간 필터: 0 전체 · 1 하루 · 7 일주일 · 180 반년 (21·30일은 서비스가 게시일로 다시 거른다) */
export type DouyinPublishTime = "0" | "1" | "7" | "180";

export interface DouyinSearchParams {
  keyword: string;
  sort: DouyinSort;
  publishTime: DouyinPublishTime;
  cursor: number;
  searchId?: string;
  backtrace?: string;
}

/** 도우인 영상 1개 (응답에 없는 값은 null) */
export interface DouyinVideo {
  awemeId: string;
  title: string;
  desc: string | null;
  author: string | null;
  coverUrl: string | null;
  /** 가져오기에 쓸 공유 주소 */
  shareUrl: string;
  publishedAt: string | null;
  durationSec: number | null;
  likes: number | null;
  comments: number | null;
  collects: number | null;
  shares: number | null;
  /** 응답에 있는 재생 주소 (다운로드용, 만들어 붙이지 않는다) */
  playUrls: string[];
}

export interface DouyinSearchPage {
  videos: DouyinVideo[];
  rawCount: number;
  cursor?: number;
  searchId?: string;
  backtrace?: string;
  hasMore: boolean;
}

export interface DouyinProvider extends BaseProvider {
  searchVideos(params: DouyinSearchParams): Promise<DouyinSearchPage>;
  /** 공유 링크 → 영상 1개 (APP → 비었을 때만 Web) */
  resolveShareUrl(shareUrl: string): Promise<DouyinVideo | null>;
}

export const douyinVideoUrl = (awemeId: string) => `https://www.douyin.com/video/${awemeId}`;
