import { FEATURES, STANDALONE_PAGES, getChannel } from "@/lib/registry";
import type { MemberRole, MemberTier, RolePermission } from "@/lib/types";

/**
 * ★ 권한 규칙 (클라이언트·서버 공용, 순수 함수)
 *
 *  접근 가능 여부 = 관리자이면 항상 허용
 *                 그 외 = 권한 관리에서 저장한 값(RolePermission) ?? Registry 의 defaultTiers
 *
 * 새 기능을 Registry 에 추가하면 defaultTiers 로 바로 동작하고, 권한 관리 화면에도 자동으로 나타난다.
 */

export const MEMBER_ROLES: MemberRole[] = ["admin", "vip", "gold", "silver"];
export const MEMBER_TIERS: MemberTier[] = ["silver", "gold", "vip"];

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "관리자",
  silver: "실버",
  gold: "골드",
  vip: "VIP",
};

/** 신규 가입자의 기본 역할 (DB 트리거와 같은 값이어야 한다: supabase/schema.sql) */
export const DEFAULT_SIGNUP_ROLE: MemberTier = "silver";

/** 권한 관리 대상 (기능 + 단독 페이지, 관리자 전용 제외) */
export interface PermissionTarget {
  key: string;
  title: string;
  group: string;
  href: string;
  defaultTiers: MemberTier[];
  planned: boolean;
}

export function getPermissionTargets(): PermissionTarget[] {
  const features = FEATURES.filter((f) => !f.adminOnly).map((f) => ({
    key: f.id,
    title: f.title,
    group: getChannel(f.channelId).name,
    href: f.href,
    defaultTiers: f.defaultTiers,
    planned: f.status === "planned",
  }));
  const pages = STANDALONE_PAGES.map((p) => ({
    key: p.id,
    title: p.title,
    group: "관리",
    href: p.href,
    defaultTiers: p.defaultTiers,
    planned: false,
  }));
  return [...features, ...pages];
}

/** 권한 관리 화면의 한 행 */
export interface PermissionRow extends PermissionTarget {
  /** 등급별 현재 허용 여부 */
  allowed: Record<MemberTier, boolean>;
  /** 등급별로 기본값(Registry)과 다르게 바뀌었는지 */
  customized: Record<MemberTier, boolean>;
}

/** 관리자만 들어갈 수 있는 키 (사이트 관리 허브와 그 기능) */
export const ADMIN_KEYS = ["admin", ...FEATURES.filter((f) => f.adminOnly).map((f) => f.id)];

export function isTierAllowed(target: PermissionTarget, tier: MemberTier, overrides: RolePermission[]): boolean {
  const override = overrides.find((o) => o.role === tier && o.permissionKey === target.key);
  return override ? override.allowed : target.defaultTiers.includes(tier);
}

/** 역할이 접근할 수 있는 권한 키 목록 */
export function resolveAllowedKeys(role: MemberRole, overrides: RolePermission[]): string[] {
  const targets = getPermissionTargets();
  if (role === "admin") return [...targets.map((t) => t.key), ...ADMIN_KEYS];
  return targets.filter((t) => isTierAllowed(t, role, overrides)).map((t) => t.key);
}

/** 허용 키 목록으로 접근 여부 판단 */
export function canAccess(allowed: string[], key: string): boolean {
  return allowed.includes(key);
}

/** 이 기능을 기본으로 쓸 수 있는 가장 낮은 등급 (안내 문구용) */
export function lowestTierFor(key: string, overrides: RolePermission[] = []): MemberTier | null {
  const target = getPermissionTargets().find((t) => t.key === key);
  if (!target) return null;
  return MEMBER_TIERS.find((tier) => isTierAllowed(target, tier, overrides)) ?? null;
}
