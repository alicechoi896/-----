import type { AuditAction, AuditLog } from "@/lib/types";

/** 활동 기록 종류 → 화면 표시 이름 (클라이언트·서버 공용) */
export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  "auth.login": "로그인",
  "auth.logout": "로그아웃",
  "auth.signup": "회원가입",
  "user.approve": "가입 승인",
  "user.reject": "가입 거절",
  "user.role_change": "등급 변경",
  "permission.change": "권한 변경",
  "permission.reset": "권한 초기화",
  "account.update_name": "이름 변경",
  "account.change_password": "비밀번호 변경",
  "account.withdraw": "회원 탈퇴",
  "publication.create": "업로드 등록",
  "publication.update": "업로드 수정",
  "publication.delete": "업로드 삭제",
};

/** 필터용 묶음 */
export const AUDIT_GROUPS: { value: string; label: string; actions: AuditAction[] }[] = [
  { value: "member", label: "회원 관리", actions: ["user.approve", "user.reject", "user.role_change"] },
  { value: "permission", label: "권한", actions: ["permission.change", "permission.reset"] },
  { value: "auth", label: "로그인·가입", actions: ["auth.login", "auth.logout", "auth.signup"] },
  { value: "account", label: "내 정보·탈퇴", actions: ["account.update_name", "account.change_password", "account.withdraw"] },
  { value: "publication", label: "업로드 관리", actions: ["publication.create", "publication.update", "publication.delete"] },
];

/** 상세 내용을 한 줄 문장으로 */
export function describeAudit(log: AuditLog): string {
  const d = log.detail as Record<string, unknown>;
  switch (log.action) {
    case "user.approve":
      return `${d.roleLabel ?? d.role ?? ""} 등급으로 승인`;
    case "user.reject":
      return d.reason ? `사유: ${d.reason}` : "";
    case "user.role_change":
      return `${d.fromLabel ?? d.from} → ${d.toLabel ?? d.to}`;
    case "permission.change":
      return d.allowed ? "허용" : "차단";
    case "permission.reset":
      return `바뀐 칸 ${d.removed ?? 0}개를 기본값으로`;
    case "account.update_name":
      return `${d.from} → ${d.to}`;
    default:
      return "";
  }
}
