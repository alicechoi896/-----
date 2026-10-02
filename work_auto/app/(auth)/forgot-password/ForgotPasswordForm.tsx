"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/States";
import { requestPasswordReset, type AuthFormState } from "../login/actions";

const initial: AuthFormState = { error: null, message: null };

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="grid gap-4">
      {state.error && <Notice tone="warning">{state.error}</Notice>}
      {state.message && <Notice tone="info">{state.message}</Notice>}
      <FormField label="이메일" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </FormField>
      <Button type="submit" variant="primary" size="lg" icon={Mail} loading={pending} className="w-full">
        재설정 링크 보내기
      </Button>
      <Link href="/login" className="text-center text-[13px] text-fg-subtle hover:text-fg">
        로그인으로 돌아가기
      </Link>
    </form>
  );
}
