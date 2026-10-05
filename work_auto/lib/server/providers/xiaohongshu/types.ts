import "server-only";
import type { XhsNote } from "@/lib/types/xhs";
import type { BaseProvider } from "../types";

/**
 * 샤오홍슈 영상 검색 Provider (docs/XIAOHONGSHU_SEARCH.md).
 * 화면·서비스는 이 interface 만 쓴다 → TikHub 대신 다른 업체로 바꿔도 영상 URL 가져오기 화면은 그대로다.
 */
export type XhsSort = "general" | "latest" | "likes" | "comments" | "collects";
/** 업체가 지원하는 기간 필터 (21·30일은 서비스가 게시일로 다시 거른다) */
export type XhsTimeFilter = "all" | "day" | "week" | "half-year";

export interface XhsSearchParams {
  keyword: string;
  sort: XhsSort;
  timeFilter: XhsTimeFilter;
  page: number;
  /** 다음 페이지용 (첫 검색 응답에서 받은 값) */
  searchId?: string;
  sessionId?: string;
}

export type { XhsNote };

export interface XhsSearchPage {
  notes: XhsNote[];
  /** 이 페이지에서 받은 원래 건수 (영상 외·중복을 빼기 전) */
  rawCount: number;
  searchId?: string;
  sessionId?: string;
  hasMore: boolean;
}

export interface XiaohongshuSearchProvider extends BaseProvider {
  searchVideos(params: XhsSearchParams): Promise<XhsSearchPage>;
  /** 상세 (상세보기를 누를 때만) */
  getVideoDetail(noteId: string, xsecToken?: string | null): Promise<XhsNote | null>;
}

/** 업체 오류 (TikHub 공용 오류를 그대로 쓴다) */
export { TikHubError as XhsSearchError } from "../tikhub/client";

export function xhsNoteUrl(noteId: string, xsecToken: string | null): string {
  const qs = new URLSearchParams({ ...(xsecToken ? { xsec_token: xsecToken } : {}), xsec_source: "app_share" });
  return `https://www.xiaohongshu.com/discovery/item/${noteId}?${qs.toString()}`;
}
