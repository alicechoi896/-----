import "server-only";
import { cache } from "react";
import { DEMO_USER_ID } from "@/lib/mock/seed";
import { canAccess, resolveAllowedKeys } from "@/lib/permissions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberRole, MemberStatus, SessionInfo } from "@/lib/types";
import { AppError } from "./http";
import { memoryRepositories } from "./repositories/memory-store";
import { supabaseRepositories } from "./repositories/supabase-store";

/**
 * 인증·권한의 서버 진입점.
 *
 * - 데모 모드(Supabase 미설정): 로그인 없이 "데모 관리자"로 동작한다.
 * - supabase 모드: Supabase Auth 세션 → profiles.role → 접근 가능한 키 계산
 *
 * getSession() 은 React cache() 로 한 요청 안에서 한 번만 실행된다.
 */

/** Supabase 가 응답하지 않을 때 요청이 멈추지 않도록 인증 확인 시간을 제한한다 (auto_genie 와 같은 방식) */
const AUTH_TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("auth timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export const getSession = cache(async (): Promise<SessionInfo | null> => {
  if (!isSupabaseConfigured()) {
    const repo = memoryRepositories;
    const profile = await repo.profiles.get(DEMO_USER_ID);
    // DEMO_ROLE 환경변수로 데모 사용자의 역할을 바꿔 등급별 화면을 미리 볼 수 있다 (예: DEMO_ROLE=silver)
    const demoRole = process.env.DEMO_ROLE as MemberRole | undefined;
    const role: MemberRole = demoRole && ["admin", "silver", "gold", "vip"].includes(demoRole) ? demoRole : (profile?.role ?? "admin");
    const overrides = await repo.rolePermissions.list();
    return {
      mode: "demo",
      user: {
        id: DEMO_USER_ID,
        email: profile?.email ?? "demo@example.com",
        name: role === "admin" ? (profile?.name ?? "데모 관리자") : "데모 사용자",
      },
      role,
      status: "active",
      allowed: resolveAllowedKeys(role, overrides),
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    const user = data.user;
    if (!user) return null;

    const [profile, overrides] = await Promise.all([
      supabaseRepositories.profiles.get(user.id),
      supabaseRepositories.rolePermissions.list(),
    ]);
    // 프로필은 가입 트리거가 만든다. 혹시 없으면 승인 전 실버로 본다
    const role: MemberRole = profile?.role ?? "silver";
    const status: MemberStatus = profile?.status ?? "pending";
    return {
      mode: "supabase",
      user: { id: user.id, email: user.email ?? "", name: profile?.name || user.email?.split("@")[0] || "사용자" },
      role,
      status,
      // 승인 전(또는 거절된) 사용자는 어떤 메뉴도 쓸 수 없다
      allowed: status === "active" ? resolveAllowedKeys(role, overrides) : [],
    };
  } catch (e) {
    console.error("[auth] session check failed", e instanceof Error ? e.message : e);
    return null;
  }
});

/** 로그인만 확인 (승인 전 사용자도 통과). 내 정보, 탈퇴 등 승인과 무관한 기능용 */
export async function requireLogin(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  return session;
}

/** API 용: 로그인 + 관리자 승인 완료 필수 */
export async function requireSession(): Promise<SessionInfo> {
  const session = await requireLogin();
  if (session.status !== "active") {
    throw new AppError("NOT_APPROVED", "관리자 승인 후 사용할 수 있습니다.", 403);
  }
  return session;
}

/** API 용: 해당 기능 권한 필수 */
export async function requireAccess(key: string): Promise<SessionInfo> {
  const session = await requireSession();
  if (!canAccess(session.allowed, key)) {
    throw new AppError("FORBIDDEN", "현재 등급으로는 이 기능을 사용할 수 없습니다.", 403);
  }
  return session;
}

/** API 용: 여러 기능 중 하나라도 권한이 있으면 통과 (예: 제품 API 는 학습·라이브러리·제품 생성 기능이 함께 쓴다) */
export async function requireAnyAccess(keys: string[]): Promise<SessionInfo> {
  const session = await requireSession();
  if (!keys.some((k) => canAccess(session.allowed, k))) {
    throw new AppError("FORBIDDEN", "현재 등급으로는 이 기능을 사용할 수 없습니다.", 403);
  }
  return session;
}

/** API 용: 관리자 필수 */
export async function requireAdmin(): Promise<SessionInfo> {
  const session = await requireSession();
  if (session.role !== "admin") throw new AppError("FORBIDDEN", "관리자만 사용할 수 있습니다.", 403);
  return session;
}
