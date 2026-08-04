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
 * Dev-only demo login. Signs in with the seeded demo workspace account.
 * Disabled outside development so this never becomes an auth bypass in prod.
 */
export async function demoSignInAction(): Promise<AuthActionState> {
  if (process.env.NODE_ENV === "production") {
    return { error: "데모 로그인은 개발 환경에서만 사용할 수 있습니다." };
  }

  const email = process.env.DEMO_USER_EMAIL || "demo@intheup.example";
  const password = process.env.DEMO_USER_PASSWORD || "demo-password-1234";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error:
        "데모 계정으로 로그인할 수 없습니다. seed 스크립트를 먼저 실행했는지 확인하세요. (" +
        error.message +
        ")",
    };
  }

  redirect("/dashboard");
}
