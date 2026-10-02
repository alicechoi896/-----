"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 로그인·회원가입 폼 상태 (useActionState) */
export interface AuthFormState {
  error: string | null;
  message: string | null;
}

/** Supabase 오류 메시지 → 사용자 안내 문구 */
function toKorean(message: string): string {
  if (/invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/email not confirmed/i.test(message)) return "이메일 인증이 완료되지 않았습니다. 받은 메일함의 인증 링크를 눌러 주세요.";
  if (/already registered|already exists/i.test(message)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (/password should be at least|weak password/i.test(message)) return "비밀번호는 6자 이상이어야 합니다.";
  if (/rate limit|too many/i.test(message)) return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  if (/invalid email|unable to validate email/i.test(message)) return "올바른 이메일 주소를 입력해 주세요.";
  return "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 로그인 후 돌아갈 경로. 외부 주소로 보내는 것(오픈 리다이렉트)을 막는다 */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase 가 아직 설정되지 않았습니다.", message: null };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요.", message: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: toKorean(error.message), message: null };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase 가 아직 설정되지 않았습니다.", message: null };
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  if (!name || !email || !password) return { error: "이름, 이메일, 비밀번호를 모두 입력해 주세요.", message: null };
  if (password.length < 8) return { error: "비밀번호는 8자 이상으로 정해 주세요.", message: null };
  if (password !== passwordConfirm) return { error: "비밀번호 확인이 일치하지 않습니다.", message: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }, // → profiles.name (가입 트리거가 읽는다)
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: toKorean(error.message), message: null };

  // 이메일 인증을 끈 프로젝트는 바로 세션이 생긴다
  if (data.session) redirect("/");
  return { error: null, message: `${email} 로 인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료됩니다.` };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
