import "server-only";
import {
  MEMBER_ROLES,
  MEMBER_TIERS,
  ROLE_LABEL,
  getPermissionTargets,
  isTierAllowed,
  type PermissionRow,
} from "@/lib/permissions";
import type { AuditLog, MemberRole, MemberTier, UserProfile } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { requireAdmin } from "../auth";
import { AppError, notFound } from "../http";
import { getRepositories } from "../repositories";
import { auditService } from "./audit";

/**
 * 사이트 관리 유스케이스 (관리자 전용).
 * 모든 메서드는 먼저 requireAdmin() 으로 관리자인지 확인한다. (Supabase 에서는 RLS 의 is_admin() 이 한 번 더 막는다)
 * 상태를 바꾸는 작업은 모두 활동 기록(audit_logs)에 남긴다.
 */
export const adminService = {
  /* ───────── 사용자 ───────── */

  async listUsers(): Promise<UserProfile[]> {
    await requireAdmin();
    const users = await getRepositories().profiles.list();
    return users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getUser(userId: string): Promise<UserProfile> {
    const user = await getRepositories().profiles.get(userId);
    if (!user) notFound("사용자");
    return user;
  },

  /** 가입 승인: 등급을 정해서 승인한다 */
  async approve(userId: string, role: MemberRole): Promise<UserProfile> {
    const session = await requireAdmin();
    if (!MEMBER_ROLES.includes(role)) throw new AppError("VALIDATION", "올바르지 않은 등급입니다.");
    const user = await this.getUser(userId);
    if (user.status === "active") throw new AppError("ALREADY_ACTIVE", "이미 승인된 사용자입니다.");
    const now = nowIso();
    const next = (await getRepositories().profiles.update(userId, {
      status: "active",
      role,
      approvedAt: now,
      approvedBy: session.user.id,
      updatedAt: now,
    }))!;
    await auditService.log(session, {
      action: "user.approve",
      targetType: "user",
      targetId: userId,
      targetLabel: `${user.name} (${user.email})`,
      detail: { role, roleLabel: ROLE_LABEL[role] },
    });
    return next;
  },

  /** 가입 거절 (거절된 사용자는 로그인해도 안내 화면만 본다. 나중에 다시 승인할 수 있다) */
  async reject(userId: string, reason?: string): Promise<UserProfile> {
    const session = await requireAdmin();
    if (userId === session.user.id) throw new AppError("SELF_REJECT", "자기 자신은 거절할 수 없습니다.");
    const user = await this.getUser(userId);
    const now = nowIso();
    const next = (await getRepositories().profiles.update(userId, {
      status: "rejected",
      approvedAt: now,
      approvedBy: session.user.id,
      updatedAt: now,
    }))!;
    await auditService.log(session, {
      action: "user.reject",
      targetType: "user",
      targetId: userId,
      targetLabel: `${user.name} (${user.email})`,
      detail: { previousStatus: user.status, reason: reason?.trim() || null },
    });
    return next;
  },

  async updateRole(userId: string, role: MemberRole): Promise<UserProfile> {
    const session = await requireAdmin();
    if (!MEMBER_ROLES.includes(role)) throw new AppError("VALIDATION", "올바르지 않은 역할입니다.");
    // 관리자가 실수로 자기 권한을 내려 아무도 관리할 수 없게 되는 것을 막는다
    if (userId === session.user.id && role !== "admin") {
      throw new AppError("SELF_DEMOTE", "자기 자신의 관리자 권한은 내릴 수 없습니다. 다른 관리자에게 요청해 주세요.");
    }
    const user = await this.getUser(userId);
    if (user.role === role) return user;
    const next = (await getRepositories().profiles.update(userId, { role, updatedAt: nowIso() }))!;
    await auditService.log(session, {
      action: "user.role_change",
      targetType: "user",
      targetId: userId,
      targetLabel: `${user.name} (${user.email})`,
      detail: { from: user.role, to: role, fromLabel: ROLE_LABEL[user.role], toLabel: ROLE_LABEL[role] },
    });
    return next;
  },

  /* ───────── 권한 ───────── */

  async getPermissionMatrix(): Promise<PermissionRow[]> {
    await requireAdmin();
    const overrides = await getRepositories().rolePermissions.list();
    return getPermissionTargets().map((t) => {
      const allowed = {} as Record<MemberTier, boolean>;
      const customized = {} as Record<MemberTier, boolean>;
      for (const tier of MEMBER_TIERS) {
        allowed[tier] = isTierAllowed(t, tier, overrides);
        customized[tier] = allowed[tier] !== t.defaultTiers.includes(tier);
      }
      return { ...t, allowed, customized };
    });
  },

  /** 등급별 권한 설정. 기본값과 같아지면 저장된 값을 지워 Registry 기본값을 따르게 한다 */
  async setPermission(role: MemberTier, permissionKey: string, allowed: boolean): Promise<PermissionRow[]> {
    const session = await requireAdmin();
    if (!MEMBER_TIERS.includes(role)) throw new AppError("VALIDATION", "올바르지 않은 등급입니다.");
    const target = getPermissionTargets().find((t) => t.key === permissionKey);
    if (!target) throw new AppError("VALIDATION", "알 수 없는 메뉴입니다.");

    const repo = getRepositories();
    const id = `${role}:${permissionKey}`;
    const existing = await repo.rolePermissions.get(id);
    const isDefault = target.defaultTiers.includes(role) === allowed;

    if (isDefault) {
      if (existing) await repo.rolePermissions.remove(id);
    } else if (existing) {
      await repo.rolePermissions.update(id, { allowed, updatedAt: nowIso() });
    } else {
      await repo.rolePermissions.insert({ id, role, permissionKey, allowed, updatedAt: nowIso() });
    }
    await auditService.log(session, {
      action: "permission.change",
      targetType: "permission",
      targetId: id,
      targetLabel: `${ROLE_LABEL[role]} · ${target.title}`,
      detail: { role, permissionKey, allowed },
    });
    return this.getPermissionMatrix();
  },

  /** 모든 권한을 Registry 기본값으로 되돌린다 */
  async resetPermissions(): Promise<PermissionRow[]> {
    const session = await requireAdmin();
    const repo = getRepositories();
    const all = await repo.rolePermissions.list();
    for (const p of all) await repo.rolePermissions.remove(p.id);
    await auditService.log(session, {
      action: "permission.reset",
      targetType: "permission",
      targetLabel: "전체 권한",
      detail: { removed: all.length },
    });
    return this.getPermissionMatrix();
  },

  /* ───────── 활동 기록 ───────── */

  async listAuditLogs(): Promise<AuditLog[]> {
    await requireAdmin();
    return auditService.list();
  },
};
