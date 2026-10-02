/**
 * Supabase 연결 설정 (클라이언트·서버 공용, 공개 값만 다룬다).
 * 두 값이 모두 있으면 "supabase 모드"(실제 로그인 + DB), 없으면 "데모 모드"(인메모리, 로그인 없음).
 */
export const supabaseEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseEnv.url && supabaseEnv.anonKey);
}

/**
 * 운영 배포(Vercel production)에서 Supabase 설정이 빠지면 데모 모드(로그인 없이 관리자)가 켜지는 것을 막는다.
 * 환경변수 실수 하나로 사이트 전체가 열리지 않게 하는 안전장치다. 일부러 데모로 운영하려면 ALLOW_DEMO=1.
 */
export function isDemoBlocked(): boolean {
  return !isSupabaseConfigured() && process.env.VERCEL_ENV === "production" && process.env.ALLOW_DEMO !== "1";
}
