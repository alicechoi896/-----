import "server-only";
import { DEMO_USER_ID } from "@/lib/mock/seed";
import { memoryRepositories } from "./memory-store";
import type { Repositories } from "./types";

export type { Repositories, Repository } from "./types";

/**
 * 저장소 진입점. DB 를 바꿀 때는 이 함수만 수정한다.
 * 예) return process.env.DATABASE_URL ? supabaseRepositories : memoryRepositories;
 */
export function getRepositories(): Repositories {
  return memoryRepositories;
}

/**
 * 현재 사용자 ID. V1 은 인증이 없으므로 데모 사용자 고정.
 * 인증을 붙이면 세션에서 읽도록 이 함수만 바꾼다.
 */
export async function getCurrentUserId(): Promise<string> {
  return DEMO_USER_ID;
}
