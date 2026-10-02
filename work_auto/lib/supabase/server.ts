import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./config";

/**
 * 요청 단위 Supabase 클라이언트 (로그인 사용자의 세션 쿠키 사용).
 * anon key + 사용자 세션으로 접근하므로 모든 조회·변경에 RLS 가 적용된다.
 * service_role 키는 쓰지 않는다 (관리자 기능도 RLS 의 is_admin() 으로 허용).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseEnv.url, supabaseEnv.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component 에서 호출된 경우: 세션 갱신은 proxy.ts 가 담당한다
        }
      },
    },
  });
}
