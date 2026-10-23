import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireSession } from "../auth";
import { memoryRepositories } from "./memory-store";
import { supabaseRepositories } from "./supabase-store";
import type { Repositories } from "./types";

export type { Repositories, Repository } from "./types";

/**
 * 저장소 진입점.
 * - Supabase 환경변수가 있으면 Supabase(Postgres), 없으면 인메모리(데모 모드).
 */
export function getRepositories(): Repositories {
  return isSupabaseConfigured() ? supabaseRepositories : memoryRepositories;
}

/**
 * 관리자 공용 데이터 (v0.9.68, docs/ADMIN_SHARED.md): workspace_settings 의 shared_owner_id.
 * 1분 기억. 표·함수가 아직 없거나(SQL 실행 전) 비어 있으면 null → 지금처럼 각자.
 */
let ownerCache: { at: number; id: string | null } | null = null;
export async function sharedOwnerId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  if (ownerCache && Date.now() - ownerCache.at < 60_000) return ownerCache.id;
  let id: string | null = null;
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("shared_owner_id");
    id = !error && typeof data === "string" && /^[0-9a-f-]{36}$/i.test(data) ? data : null;
  } catch {
    id = null;
  }
  ownerCache = { at: Date.now(), id };
  return id;
}

/**
 * 현재 사용자의 '데이터 주인' ID (서비스 데이터용).
 * 관리자는 공용 주인 계정의 데이터를 함께 쓴다 (API 키·대본 포맷·키워드·제품·스타일·생성 기록·영상 등). 직원은 본인.
 * 로그인하지 않았으면 401, 관리자 승인 전이면 403.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await requireSession();
  if (session.role === "admin") {
    const owner = await sharedOwnerId();
    if (owner) return owner;
  }
  return session.user.id;
}

/** 실제 로그인한 사람 ID (공용 데이터라도 '누가 했는지' 가 필요할 때) */
export async function getActorId(): Promise<string> {
  return (await requireSession()).user.id;
}
