/** 샤오홍슈 영상 검색 결과 (화면·서버 공용). 업체 응답에 없는 값은 null — 만들어 넣지 않는다. docs/XIAOHONGSHU_SEARCH.md */
export interface XhsNote {
  noteId: string;
  xsecToken: string | null;
  /** 기존 영상 가져오기에 그대로 넘길 원본 주소 */
  url: string;
  title: string;
  desc: string | null;
  author: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  collects: number | null;
  durationSec: number | null;
  /** 검색 응답에 들어 있는 H.264 재생 주소 (미리보기용, 만료됨 — 저장하지 않는다) */
  previewUrl?: string | null;
}

export type XhsSortOption = "general" | "latest" | "likes" | "comments" | "collects";
export type XhsPeriodOption = "7" | "21" | "30" | "all";

export interface XhsSearchCursor {
  page: number;
  searchId?: string;
  sessionId?: string;
}

export interface XhsSearchResultDto {
  notes: XhsNote[];
  next: XhsSearchCursor | null;
  calls: number;
  filteredByDate: boolean;
}
