/** 인스타그램 트렌드 찾기 (v0.9.53) — 화면·서버 공용. 업체 응답에 없는 값은 null (만들어 넣지 않는다). docs/INSTAGRAM_TRENDS.md */
export interface IgReel {
  /** 짧은 코드 (instagram.com/reel/{code}) */
  code: string;
  url: string;
  caption: string;
  hashtags: string[];
  author: string | null;
  /** 작성자 팔로워 (응답에 있을 때만) */
  followers: number | null;
  plays: number | null;
  likes: number | null;
  comments: number | null;
  postedAt: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
}

export interface IgSearchResult {
  keyword: string;
  items: IgReel[];
  /** 다음 페이지 (없으면 null) */
  next: string | null;
  /** 이번 요청에서 업체를 부른 횟수 (같은 검색 30분 기억 → 0) */
  calls: number;
}
