import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./config";
import { automationClient } from "@/lib/server/automation/context";

/**
 * 요청 단위 Supabase 클라이언트 (로그인 사용자의 세션 쿠키 사용).
 * anon key + 사용자 세션으로 접근하므로 모든 조회·변경에 RLS 가 적용된다.
 * service_role 키는 쓰지 않는다 (관리자 기능도 RLS 의 is_admin() 으로 허용).
 */
async function cookieClient() {
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

export async function createSupabaseServerClient(): ReturnType<typeof cookieClient> {
  // v0.9.107 새벽 자동 제작: 자동화 계정으로 로그인한 클라이언트 (그 실행 흐름 안에서만, 역시 anon key + RLS)
  const auto = automationClient();
  if (auto) return auto as unknown as Awaited<ReturnType<typeof cookieClient>>;
  return cookieClient();
}
