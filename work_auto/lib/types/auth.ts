import type { ID, ISODate } from "./common";

/**
 * 회원 역할.
 * - admin: 사이트 관리자. 모든 페이지 + 사이트 관리
 * - silver / gold / vip: 일반 사용자 등급. 접근 가능한 페이지는 "권한 관리"에서 정한다
 */
export type MemberRole = "admin" | "silver" | "gold" | "vip";

/** 일반 사용자 등급 (권한 관리 화면에서 편집하는 대상) */
export type MemberTier = Exclude<MemberRole, "admin">;

/** 사용자 프로필 (Supabase auth.users 1:1, 역할 보관) */
export interface UserProfile {
  id: ID;
  email: string;
  name: string;
  role: MemberRole;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/**
 * 등급별 접근 권한 (Registry 기본값을 덮어쓰는 값만 저장한다).
 * id = `${role}:${permissionKey}`
 */
export interface RolePermission {
  id: string;
  role: MemberTier;
  /** 기능 ID 또는 단독 페이지 ID (예: "yt-trends", "ai-learning") */
  permissionKey: string;
  allowed: boolean;
  updatedAt: ISODate;
}

/** 클라이언트에 내려주는 현재 사용자 정보 */
export interface SessionInfo {
  /** demo: Supabase 미설정 (로그인 없이 데모 관리자) / supabase: 실제 로그인 */
  mode: "demo" | "supabase";
  user: { id: ID; email: string; name: string };
  role: MemberRole;
  /** 접근 가능한 권한 키 목록 */
  allowed: string[];
}
