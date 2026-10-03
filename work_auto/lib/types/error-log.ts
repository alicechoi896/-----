import type { ID, ISODate } from "./common";

/**
 * 오류 기록 (error_logs) — 서버 API 오류와 화면(브라우저) 오류를 모아 관리자가 본다.
 * 비밀값(API 키, 토큰)은 저장 전에 가린다. 30일이 지나면 자동 삭제. (docs/OPERATIONS.md)
 */
export interface ErrorLog {
  id: ID;
  /** server: API 처리 중 / client: 화면(브라우저) */
  source: "server" | "client";
  /** 오류가 난 경로 (API 경로 또는 화면 주소) */
  path: string;
  method: string;
  code: string;
  status: number | null;
  message: string;
  stack: string;
  /** 같은 오류 묶음용 (메시지 + 첫 위치) */
  fingerprint: string;
  userId: ID | null;
  userEmail: string;
  userAgent: string;
  createdAt: ISODate;
}
