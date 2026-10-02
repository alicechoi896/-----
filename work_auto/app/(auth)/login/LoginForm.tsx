"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { clearApiCache } from "@/lib/api-client";
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

  // 이전 사용자의 조회 캐시가 남지 않도록 로그인 화면에서 비운다
  useEffect(() => clearApiCache(), []);

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
          <Link href="/forgot-password" className="text-center text-[13px] text-fg-subtle hover:text-fg">
            비밀번호를 잊으셨나요?
          </Link>
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
          <div className="grid gap-2 rounded-control border border-line bg-subtle/60 px-3 py-3 text-[13px]">
            <AgreeCheck name="agreeTerms" href="/terms" label="이용약관" />
            <AgreeCheck name="agreePrivacy" href="/privacy" label="개인정보 수집·이용" />
          </div>
          <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={signingUp} className="mt-2 w-full">
            가입 신청
          </Button>
          <p className="text-center text-xs leading-relaxed text-fg-subtle">
            가입 신청 후 관리자가 승인하면 사용할 수 있습니다.
            <br />
            승인 전까지는 로그인해도 &lsquo;승인 대기&rsquo; 안내만 보입니다.
          </p>
        </form>
      )}
    </div>
  );
}

/** 약관 동의 체크 (필수). 새 탭으로 전문을 볼 수 있다 */
function AgreeCheck({ name, href, label }: { name: string; href: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-fg-muted">
      <input type="checkbox" name={name} required className="size-4 accent-[var(--color-brand)]" />
      <span>
        <span className="text-danger">[필수]</span> {label}에 동의합니다
      </span>
      <a href={href} target="_blank" rel="noreferrer" className="ml-auto text-xs text-fg-subtle underline hover:text-fg">
        보기
      </a>
    </label>
  );
}
