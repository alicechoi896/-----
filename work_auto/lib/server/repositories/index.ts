import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
 * 현재 로그인 사용자 ID (서비스 데이터용).
 * 로그인하지 않았으면 401, 관리자 승인 전이면 403.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await requireSession();
  return session.user.id;
}
