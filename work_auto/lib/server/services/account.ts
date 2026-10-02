import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { requireLogin } from "../auth";
import { AppError, notFound } from "../http";
import { getRepositories } from "../repositories";
import { auditService } from "./audit";

/** 비밀번호 규칙 (회원가입·변경·재설정 공통) */
export const PASSWORD_MIN_LENGTH = 8;

function assertSupabase(action: string) {
  if (!isSupabaseConfigured()) {
    throw new AppError("DEMO_MODE", `데모 모드에서는 ${action}을(를) 할 수 없습니다. Supabase 를 연결하면 사용할 수 있습니다.`);
  }
}

/** 현재 비밀번호 확인 (변경·탈퇴 전에 본인 확인) */
async function verifyPassword(email: string, password: string) {
  if (!password) throw new AppError("VALIDATION", "현재 비밀번호를 입력해 주세요.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AppError("WRONG_PASSWORD", "현재 비밀번호가 올바르지 않습니다.", 400);
}

/**
 * 내 정보 유스케이스. 승인 전 사용자도 쓸 수 있다 (requireLogin).
 */
export const accountService = {
  async getMe(): Promise<UserProfile> {
    const session = await requireLogin();
    const profile = await getRepositories().profiles.get(session.user.id);
    if (!profile) notFound("프로필");
    return profile;
  },

  async updateName(name: string): Promise<UserProfile> {
    const session = await requireLogin();
    const trimmed = name?.trim() ?? "";
    if (trimmed.length < 1 || trimmed.length > 30) throw new AppError("VALIDATION", "이름은 1~30자로 입력해 주세요.");
    const before = await this.getMe();
    const next = await getRepositories().profiles.update(session.user.id, { name: trimmed, updatedAt: nowIso() });
    if (!next) notFound("프로필");
    await auditService.log(session, {
      action: "account.update_name",
      targetType: "account",
      targetId: session.user.id,
      targetLabel: session.user.email,
      detail: { from: before.name, to: trimmed },
    });
    return next;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
    const session = await requireLogin();
    assertSupabase("비밀번호 변경");
    if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new AppError("VALIDATION", `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`);
    }
    if (newPassword === currentPassword) throw new AppError("VALIDATION", "새 비밀번호가 현재 비밀번호와 같습니다.");
    await verifyPassword(session.user.email, currentPassword);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new AppError("PASSWORD_UPDATE_FAILED", "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", 400);
    await auditService.log(session, {
      action: "account.change_password",
      targetType: "account",
      targetId: session.user.id,
      targetLabel: session.user.email,
    });
    return { ok: true };
  },

  /**
   * 회원 탈퇴: 본인 확인 → 기록 → 계정 삭제(DB 함수 delete_my_account) → 로그아웃.
   * 계정을 지우면 제품, 생성 이력, 스타일, API 키 등 내 데이터가 모두 함께 삭제된다 (FK on delete cascade).
   * 활동 기록은 남는다 (수행자 이메일·이름을 복사해 두었기 때문).
   */
  async withdraw(password: string): Promise<{ ok: true }> {
    const session = await requireLogin();
    assertSupabase("회원 탈퇴");
    await verifyPassword(session.user.email, password);
    if (session.role === "admin") {
      const admins = (await getRepositories().profiles.list((p) => p.role === "admin" && p.status === "active")).length;
      if (admins <= 1) throw new AppError("LAST_ADMIN", "마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.");
    }

    await auditService.log(session, {
      action: "account.withdraw",
      targetType: "account",
      targetId: session.user.id,
      targetLabel: `${session.user.name} (${session.user.email})`,
    });

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      console.error("[account] withdraw failed", error.message);
      throw new AppError("WITHDRAW_FAILED", "탈퇴 처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.", 500);
    }
    await supabase.auth.signOut().catch(() => undefined);
    return { ok: true };
  },
};
