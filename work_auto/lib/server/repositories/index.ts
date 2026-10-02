import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSession } from "../auth";
import { AppError } from "../http";
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

/** 현재 로그인 사용자 ID. 로그인하지 않았으면 401 */
export async function getCurrentUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
  return session.user.id;
}
