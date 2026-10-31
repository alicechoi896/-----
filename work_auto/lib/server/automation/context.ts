import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseEnv } from "@/lib/supabase/config";

/**
 * 자동 실행 권한 (v0.9.107) — 새벽 자동 제작(크론)은 로그인한 사람이 없으므로
 * 자동화 계정(AUTOMATION_EMAIL / AUTOMATION_PASSWORD, Vercel 환경변수에만)으로 로그인한 Supabase 클라이언트를
 * 이 실행 흐름 안에서만 쓴다. createSupabaseServerClient() 가 이 클라이언트를 돌려주므로
 * 세션 확인·RLS·관리자 공용 데이터(shared_owner_id)가 평소와 똑같이 적용된다. service_role 키는 쓰지 않는다.
 * 비밀번호·토큰은 로그·응답·화면에 내보내지 않는다.
 */
interface AutomationStore {
  client: SupabaseClient;
  /** 유료 대체 경로(TikHub 등)를 쓰지 않는다 */
  noPaidFallback: boolean;
}
const als = new AsyncLocalStorage<AutomationStore>();

/** 지금 자동 실행 중이면 그 클라이언트 */
export const automationClient = (): SupabaseClient | null => als.getStore()?.client ?? null;
/** 자동 실행 중에는 TikHub 같은 유료 대체 경로를 쓰지 않는다 (사용자가 정한 원칙) */
export const isAutomationRun = () => Boolean(als.getStore());
export const noPaidFallback = () => als.getStore()?.noPaidFallback ?? false;

export const automationConfigured = () => Boolean(process.env.AUTOMATION_EMAIL && process.env.AUTOMATION_PASSWORD);

/** 지금 로그인한 사람으로 실행하되 유료 대체 경로(TikHub)만 막는다 ([지금 1개 시험 실행]) */
export function runWithoutPaidFallback<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ client: null as unknown as SupabaseClient, noPaidFallback: true }, fn);
}

/** 자동화 계정으로 로그인해 fn 을 실행한다. 데모(Supabase 없음)는 데모 관리자로 그대로 */
export async function runAsAutomation<T>(fn: () => Promise<T>): Promise<T> {
  if (!isSupabaseConfigured()) {
    // 데모: 메모리 저장소 + 데모 관리자. 유료 대체 경로만 막는다
    return als.run({ client: null as unknown as SupabaseClient, noPaidFallback: true }, fn);
  }
  if (!automationConfigured()) throw new Error("자동화 계정이 설정되지 않았습니다 (Vercel 환경변수 AUTOMATION_EMAIL·AUTOMATION_PASSWORD).");
  const client = createClient(supabaseEnv.url, supabaseEnv.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await client.auth.signInWithPassword({ email: process.env.AUTOMATION_EMAIL!, password: process.env.AUTOMATION_PASSWORD! });
  if (error) throw new Error(`자동화 계정으로 로그인하지 못했습니다 (${error.message.slice(0, 80)}).`);
  try {
    return await als.run({ client, noPaidFallback: true }, fn);
  } finally {
    await client.auth.signOut().catch(() => undefined);
  }
}
