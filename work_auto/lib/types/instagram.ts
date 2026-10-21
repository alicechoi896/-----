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
  /** 재생 주소 (검색 응답에 있을 때만, 만료됨 — 저장하지 않는다) */
  videoUrl?: string | null;
}

/** 어디서 찾았는지 (v0.9.57): meta = Instagram 공식 API(무료·해시태그만·조회수 없음), tikhub = TikHub(유료·키워드·조회수) */
export type IgSource = "meta" | "tikhub";
export type IgMetaKind = "top" | "recent";

/** 화면이 처음 열릴 때: 연결 여부만 (외부 호출 없음) */
export interface IgSourceStatus {
  meta: boolean;
  tikhub: boolean;
}

export interface IgSearchResult {
  keyword: string;
  source: IgSource;
  /** 공식 API: 실제로 찾은 해시태그 (띄어쓰기·# 를 뺀 것) */
  hashtag?: string;
  /** 공식 API: 이번 주(7일) 해시태그 한도 */
  quota?: { used: number; limit: number } | null;
  /** 공식 API: 사진·앨범이라 뺀 수 */
  skipped?: number;
  items: IgReel[];
  /** 다음 페이지 (없으면 null) */
  next: string | null;
  /** 이번 요청에서 업체를 부른 횟수 (같은 검색 30분 기억 → 0). TikHub 는 1회 = 약 $0.01, 공식 API 는 무료 */
  calls: number;
}
