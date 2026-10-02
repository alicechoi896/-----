import "server-only";
import { MEMBER_ROLES, MEMBER_TIERS, getPermissionTargets, isTierAllowed, type PermissionRow } from "@/lib/permissions";
import type { MemberRole, MemberTier, UserProfile } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { requireAdmin } from "../auth";
import { AppError, notFound } from "../http";
import { getRepositories } from "../repositories";

/**
 * 사이트 관리 유스케이스 (관리자 전용).
 * 모든 메서드는 먼저 requireAdmin() 으로 관리자인지 확인한다. (Supabase 에서는 RLS 의 is_admin() 이 한 번 더 막는다)
 */
export const adminService = {
  async listUsers(): Promise<UserProfile[]> {
    await requireAdmin();
    const users = await getRepositories().profiles.list();
    return users.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async updateRole(userId: string, role: MemberRole): Promise<UserProfile> {
    const session = await requireAdmin();
    if (!MEMBER_ROLES.includes(role)) throw new AppError("VALIDATION", "올바르지 않은 역할입니다.");
    // 관리자가 실수로 자기 권한을 내려 아무도 관리할 수 없게 되는 것을 막는다
    if (userId === session.user.id && role !== "admin") {
      throw new AppError("SELF_DEMOTE", "자기 자신의 관리자 권한은 내릴 수 없습니다. 다른 관리자에게 요청해 주세요.");
    }
    const repo = getRepositories();
    const user = await repo.profiles.get(userId);
    if (!user) notFound("사용자");
    return (await repo.profiles.update(userId, { role, updatedAt: nowIso() }))!;
  },

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
    await requireAdmin();
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
    return this.getPermissionMatrix();
  },

  /** 모든 권한을 Registry 기본값으로 되돌린다 */
  async resetPermissions(): Promise<PermissionRow[]> {
    await requireAdmin();
    const repo = getRepositories();
    for (const p of await repo.rolePermissions.list()) await repo.rolePermissions.remove(p.id);
    return this.getPermissionMatrix();
  },
};
