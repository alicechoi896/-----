"use client";

import { useActionState, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/States";
import { SegmentedControl } from "@/components/ui/Tabs";
import { signIn, signUp, type AuthFormState } from "./actions";

const initial: AuthFormState = { error: null, message: null };

/** 로그인 / 회원가입 전환 폼 */
export function LoginForm({ next, callbackError }: { next: string; callbackError: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useActionState(signIn, initial);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initial);
  const state = mode === "signin" ? signInState : signUpState;

  return (
    <div className="rounded-card border border-line bg-canvas p-6 shadow-card">
      <SegmentedControl
        className="mb-6 w-full [&>button]:flex-1"
        value={mode}
        onChange={setMode}
        options={[
          { value: "signin", label: "로그인" },
          { value: "signup", label: "회원가입" },
        ]}
      />

      {callbackError && mode === "signin" && !state.error && (
        <Notice tone="warning" className="mb-4">
          인증 링크가 만료되었거나 올바르지 않습니다. 다시 로그인하거나 가입해 주세요.
        </Notice>
      )}
      {state.error && (
        <Notice tone="warning" className="mb-4">
          {state.error}
        </Notice>
      )}
      {state.message && (
        <Notice tone="info" className="mb-4">
          {state.message}
        </Notice>
      )}

      {mode === "signin" ? (
        <form action={signInAction} className="grid gap-4">
          <input type="hidden" name="next" value={next} />
          <FormField label="이메일" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </FormField>
          <FormField label="비밀번호" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </FormField>
          <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={signingIn} className="mt-2 w-full">
            로그인
          </Button>
        </form>
      ) : (
        <form action={signUpAction} className="grid gap-4">
          <FormField label="이름" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required placeholder="홍길동" />
          </FormField>
          <FormField label="이메일" htmlFor="su-email">
            <Input id="su-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </FormField>
          <FormField label="비밀번호" htmlFor="su-password" hint="8자 이상">
            <Input id="su-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
          </FormField>
          <FormField label="비밀번호 확인" htmlFor="su-password2">
            <Input id="su-password2" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={8} />
          </FormField>
          <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={signingUp} className="mt-2 w-full">
            회원가입
          </Button>
          <p className="text-center text-xs text-fg-subtle">가입하면 실버 등급으로 시작합니다. 등급은 관리자가 변경합니다.</p>
        </form>
      )}
    </div>
  );
}
