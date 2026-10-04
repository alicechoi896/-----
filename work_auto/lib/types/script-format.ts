import type { ChannelId, ID, ISODate } from "./common";

/**
 * 대본 포맷 (script_formats, v0.9.26) — "영상 대본을 어떤 구조로 쓸 것인가". docs/SCRIPT_FORMATS.md
 * 참고 대본 여러 개 → AI 가 공통 구조를 뽑은 가이드라인. 유형(제품 홍보·정보성)마다 기본 포맷 1개.
 * 나의 스타일(말투·표현)과는 따로 관리한다.
 */
export type ScriptFormatType = "product" | "info";

export interface ScriptExample {
  /** 영상 제목 (있으면) */
  title: string;
  /** 조회수 (있으면). 생성할 때 조회수가 높은 대본을 먼저 참고한다 */
  views: number | null;
  text: string;
}

export interface ScriptFormat {
  id: ID;
  userId: ID;
  name: string;
  contentType: ScriptFormatType;
  /** 적용 채널 (YouTube·NAVER 클립). 비어 있으면 둘 다 */
  channelIds: ChannelId[];
  /** 참고 대본 */
  examples: ScriptExample[];
  /** 대본 구조 가이드라인 (AI 가 만들고 사용자가 고친다). 생성할 때 항상 전부 보낸다 */
  guideline: string;
  /** 유형마다 1개: 생성 화면에서 고르지 않으면 자동 적용 */
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ScriptFormatInput = Pick<ScriptFormat, "name" | "contentType" | "channelIds" | "examples" | "guideline" | "isDefault">;
