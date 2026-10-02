"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { auditService } from "@/lib/server/services/audit";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuditAction } from "@/lib/types";
import { createId } from "@/lib/utils";

/** 로그인·회원가입·비밀번호 폼 상태 (useActionState) */
export interface AuthFormState {
  error: string | null;
  message: string | null;
}

const PASSWORD_MIN_LENGTH = 8;

/** Supabase 오류 메시지 → 사용자 안내 문구 */
function toKorean(message: string): string {
  if (/invalid login credentials/i.test(message)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (/email not confirmed/i.test(message)) return "이메일 인증이 완료되지 않았습니다. 받은 메일함의 인증 링크를 눌러 주세요.";
  if (/already registered|already exists/i.test(message)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (/password should be at least|weak password/i.test(message)) return `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`;
  if (/same.*password|different from the old/i.test(message)) return "이전과 다른 비밀번호를 입력해 주세요.";
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

/**
 * 로그인·가입 직후에는 쿠키가 아직 요청에 반영되지 않았을 수 있어,
 * 방금 로그인한 클라이언트로 직접 활동 기록을 남긴다. 실패해도 로그인은 계속 진행한다.
 */
async function logWithClient(
  supabase: SupabaseClient,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> },
  action: AuditAction,
) {
  const name = String(user.user_metadata?.name ?? user.email?.split("@")[0] ?? "");
  const { error } = await supabase.from("audit_logs").insert({
    id: createId("log"),
    actor_id: user.id,
    actor_email: user.email ?? "",
    actor_name: name,
    action,
    target_type: "auth",
    target_id: user.id,
    target_label: user.email ?? "",
    detail: {},
  });
  if (error) console.error("[audit] auth log failed", action, error.message);
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase 가 아직 설정되지 않았습니다.", message: null };
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요.", message: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: toKorean(error.message), message: null };
  if (data.user) await logWithClient(supabase, data.user, "auth.login");
  // 승인 전 사용자는 (app)/layout 이 승인 대기 화면으로 보낸다
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "Supabase 가 아직 설정되지 않았습니다.", message: null };
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const agreeTerms = formData.get("agreeTerms") === "on";
  const agreePrivacy = formData.get("agreePrivacy") === "on";

  if (!name || !email || !password) return { error: "이름, 이메일, 비밀번호를 모두 입력해 주세요.", message: null };
  if (name.length > 30) return { error: "이름은 30자 이내로 입력해 주세요.", message: null };
  if (password.length < PASSWORD_MIN_LENGTH) return { error: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.`, message: null };
  if (password !== passwordConfirm) return { error: "비밀번호 확인이 일치하지 않습니다.", message: null };
  if (!agreeTerms || !agreePrivacy) return { error: "이용약관과 개인정보처리방침에 동의해 주세요.", message: null };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // → profiles.name, profiles.terms_agreed_at (가입 트리거가 읽는다)
      data: { name, terms_agreed_at: new Date().toISOString() },
      emailRedirectTo: `${await getOrigin()}/auth/callback`,
    },
  });
  if (error) return { error: toKorean(error.message), message: null };

  // 이메일 인증을 끈 프로젝트는 바로 세션이 생긴다 → 승인 대기 화면으로
  if (data.session && data.user) {
    await logWithClient(supabase, data.user, "auth.signup");
    redirect("/pending");
  }
  return {
    error: null,
    message: `${email} 로 인증 메일을 보냈습니다. 메일의 링크를 누른 뒤, 관리자 승인이 끝나면 사용할 수 있습니다.`,
  };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const session = await getSession();
    if (session) await auditService.log(session, { action: "auth.logout", targetType: "auth", targetId: session.user.id, targetLabel: session.user.email });
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

/** 비밀번호 찾기: 재설정 링크 메일 발송. 가입 여부를 알 수 없도록 결과 문구는 항상 같다 */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "데모 모드에서는 사용할 수 없습니다.", message: null };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "가입한 이메일을 입력해 주세요.", message: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit|too many/i.test(error.message)) return { error: toKorean(error.message), message: null };
  return {
    error: null,
    message: "가입된 이메일이라면 비밀번호 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.",
  };
}

/** 재설정 링크로 들어온 사용자의 새 비밀번호 저장 */
export async function resetPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isSupabaseConfigured()) return { error: "데모 모드에서는 사용할 수 없습니다.", message: null };
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  if (password.length < PASSWORD_MIN_LENGTH) return { error: `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`, message: null };
  if (password !== passwordConfirm) return { error: "비밀번호 확인이 일치하지 않습니다.", message: null };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "재설정 링크가 만료되었습니다. 비밀번호 찾기를 다시 진행해 주세요.", message: null };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: toKorean(error.message), message: null };
  await logWithClient(supabase, data.user, "account.change_password");
  redirect("/");
}
