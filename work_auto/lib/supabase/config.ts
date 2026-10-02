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
