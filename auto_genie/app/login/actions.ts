"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export type AuthActionState = { error: string | null };

export async function signInAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "이메일과 비밀번호(6자 이상)를 정확히 입력하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "로그인에 실패했습니다: " + error.message };
  }

  redirect("/dashboard");
}

export async function signUpAction(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "이메일과 비밀번호(6자 이상)를 정확히 입력하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    return { error: "회원가입에 실패했습니다: " + error.message };
  }

  redirect("/dashboard");
}

/**
 * 무료체험모드(시연모드): 실제로 로그인하지 않고도 미리 준비된 데모 계정으로
 * 즉시 로그인해 관리자/일반 사용자 화면을 그대로 체험할 수 있게 한다.
 * 별도의 가짜 세션이 아니라 실제 supabase.auth.signInWithPassword 로그인이므로
 * 이후 화면은 진짜 로그인한 것과 완전히 동일하게 동작한다. 계정은 시제품
 * 예시 데이터만 들어있는 데모 워크스페이스 전용이며 운영 환경에서도 사용 가능하다
 * (seed-personas.ts로 생성되는 계정과 동일한 이메일/비밀번호를 사용한다).
 */
async function trySignIn(email: string, password: string): Promise<AuthActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        "체험 계정으로 로그인할 수 없습니다. seed 스크립트를 먼저 실행했는지 확인하세요. (" +
        error.message +
        ")",
    };
  }

  redirect("/dashboard");
}

export async function tryAdminDemoAction(): Promise<AuthActionState> {
  const email = process.env.DEMO_USER_EMAIL || "demo@intheup.example";
  const password = process.env.DEMO_USER_PASSWORD || "demo-password-1234";
  return trySignIn(email, password);
}

export async function tryUserDemoAction(): Promise<AuthActionState> {
  const email = process.env.DEMO_MEMBER_EMAIL || "user@intheup.example";
  const password = process.env.DEMO_MEMBER_PASSWORD || "user-password-1234";
  return trySignIn(email, password);
}
