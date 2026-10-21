/**
 * 키워드 관리 (v0.9.56) — 뜨는 키워드를 제품과 묶어 6개월 수명으로 관리한다. docs/KEYWORD_LIBRARY.md
 * 자동: 트렌드 찾기(YouTube·NAVER·Instagram)·원고 생성의 Keyword Intelligence·스크랩에서 이미 받은 데이터로 (추가 호출 0)
 * 수동: AI 학습 관리 › 키워드 관리에서 직접 추가·제품 연결·고정·숨김
 * 만료: 마지막으로 보인 날 + 6개월 → 보관함 (고정한 키워드는 만료 없음, 지우지 않음)
 */
import type { ID, ISODate } from "./common";

export type KeywordOrigin = "manual" | "youtube-trend" | "naver-trend" | "instagram" | "keyword-intel" | "scrap";
export type KeywordStatus = "active" | "archived";
export type KeywordTrend = "up" | "flat" | "down" | "new";

export interface TrendKeyword {
  id: ID;
  userId: ID;
  keyword: string;
  /** 같은 말 묶음 키 (띄어쓰기·대소문자·순서·프로/Pro 무시) */
  norm: string;
  /** 같은 말로 본 다른 표기 */
  aliases: string[];
  /** 연결 제품 (제품 라이브러리) */
  productId: ID | null;
  /** 아직 라이브러리에 없는 제품 후보 이름 */
  productHint: string;
  /** 출처별로 본 횟수 */
  sources: Partial<Record<KeywordOrigin, number>>;
  /** 주별로 본 횟수 ("2026-W43": 5) — 상승·하락 판단 (최근 26주만) */
  weeks: Record<string, number>;
  /** 함께 본 영상·글의 최고 조회수 */
  views: number;
  /** NAVER 데이터랩 상대 관심도 (검색량 아님) — [관심도 갱신] 때만 */
  interest: { at: ISODate; value: number; direction: "up" | "flat" | "down" } | null;
  status: KeywordStatus;
  /** 고정: 만료되지 않음 */
  pinned: boolean;
  /** 숨김: 추천·뜨는 키워드에 안 보임 (자동 수집도 다시 살리지 않음) */
  hidden: boolean;
  note: string;
  firstSeenAt: ISODate;
  lastSeenAt: ISODate;
  archivedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface TrendKeywordView extends TrendKeyword {
  trend: KeywordTrend;
  /** 최근 2주 본 횟수 */
  recent: number;
  /** 만료까지 남은 일 (고정이면 null) */
  daysLeft: number | null;
  productName: string | null;
}

export const KEYWORD_ORIGIN_LABEL: Record<KeywordOrigin, string> = {
  manual: "직접",
  "youtube-trend": "YouTube 트렌드",
  "naver-trend": "NAVER 트렌드",
  instagram: "Instagram",
  "keyword-intel": "원고 생성",
  scrap: "스크랩",
};

export const KEYWORD_LIFETIME_DAYS = 180;
