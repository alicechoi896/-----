import type { ID, ISODate } from "./common";

/**
 * 회원 역할.
 * - admin: 사이트 관리자. 모든 페이지 + 사이트 관리
 * - silver / gold / vip: 일반 사용자 등급. 접근 가능한 페이지는 "권한 관리"에서 정한다
 */
export type MemberRole = "admin" | "silver" | "gold" | "vip";

/** 일반 사용자 등급 (권한 관리 화면에서 편집하는 대상) */
export type MemberTier = Exclude<MemberRole, "admin">;

/**
 * 가입 상태.
 * - pending: 가입했지만 관리자 승인 전 (어떤 메뉴도 쓸 수 없음)
 * - active: 승인됨
 * - rejected: 관리자가 거절함
 */
export type MemberStatus = "pending" | "active" | "rejected";

/** 사용자 프로필 (Supabase auth.users 1:1, 역할·승인 상태 보관) */
export interface UserProfile {
  id: ID;
  email: string;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  /** 승인(또는 거절) 처리 시각과 처리한 관리자 */
  approvedAt: ISODate | null;
  approvedBy: ID | null;
  /** 이용약관·개인정보처리방침 동의 시각 (가입 시) */
  termsAgreedAt: ISODate | null;
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

/** 활동 기록 종류 */
export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  | "user.approve"
  | "user.reject"
  | "user.role_change"
  | "permission.change"
  | "permission.reset"
  | "account.update_name"
  | "account.change_password"
  | "account.withdraw"
  | "publication.create"
  | "publication.update"
  | "publication.delete";

/** 활동 기록 (감사 로그). 사용자가 탈퇴해도 남도록 actor 정보를 복사해 둔다 */
export interface AuditLog {
  id: ID;
  actorId: ID;
  actorEmail: string;
  actorName: string;
  action: AuditAction;
  /** 대상 종류와 표시 이름 (예: user / 홍길동) */
  targetType: "user" | "permission" | "account" | "auth" | "publication";
  targetId: string | null;
  targetLabel: string | null;
  /** 변경 전후 값 등 */
  detail: Record<string, unknown>;
  createdAt: ISODate;
}

/** 클라이언트에 내려주는 현재 사용자 정보 */
export interface SessionInfo {
  /** demo: Supabase 미설정 (로그인 없이 데모 관리자) / supabase: 실제 로그인 */
  mode: "demo" | "supabase";
  user: { id: ID; email: string; name: string };
  role: MemberRole;
  status: MemberStatus;
  /** 접근 가능한 권한 키 목록 (승인 전이면 비어 있다) */
  allowed: string[];
}
