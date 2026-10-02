/** 공통 기본 타입. 모든 Entity 타입은 이 파일의 타입을 기반으로 한다. */

export type ID = string;
/** ISO 8601 문자열 (예: "2026-10-01T09:00:00.000Z") */
export type ISODate = string;

/** 1차 메뉴 = 채널. 새 채널은 lib/registry/channels.ts 에도 추가한다. */
export type ChannelId = "youtube" | "naver-clip" | "naver-blog" | "tools";

/** 외부 API Provider 식별자 (API 연결 센터 단위) */
export type ProviderId = "openai" | "youtube" | "naver";

/** 기능 구현 상태: live=실제 API 연동, mock=Mock 데이터로 동작, planned=준비 중 */
export type FeatureStatus = "live" | "mock" | "planned";

export interface User {
  id: ID;
  email: string;
  name: string;
  plan: "free" | "pro";
  createdAt: ISODate;
}

/** Route Handler 가 돌려주는 응답의 공통 형태 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
