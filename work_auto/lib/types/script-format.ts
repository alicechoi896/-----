import type { ChannelId, ID, ISODate } from "./common";
import type { PreferredTypes } from "@/lib/style-types";

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
  /**
   * 설득 구조 (v0.9.37, 나의 스타일에서 옮겨 옴): Hook·CTA·제목 패턴·원하는 유형.
   * 비어 있으면 생성할 때 예전처럼 스타일의 것을 쓴다 (포맷 → 스타일 순서)
   */
  hooks?: string[];
  ctas?: string[];
  titlePatterns?: string[];
  preferredTypes?: PreferredTypes;
  /** 피해야 할 대본 (반응이 낮았던 대본 등, 3단계). 생성할 때 '이렇게 쓰지 않는다'로 짧게 */
  badExamples?: ScriptExample[];
  /** 캡션 (v0.9.54, 인스타그램 트렌드 등에서 담은 잘된 캡션) — 설명글·캡션 참고 */
  captions?: string[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ScriptFormatInput = Pick<ScriptFormat, "name" | "contentType" | "channelIds" | "examples" | "guideline" | "isDefault" | "hooks" | "ctas" | "titlePatterns" | "preferredTypes" | "badExamples" | "captions">;
