"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/States";
import { resetPassword, type AuthFormState } from "../login/actions";

const initial: AuthFormState = { error: null, message: null };

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);
  return (
    <form action={action} className="grid gap-4">
      <p className="text-[13px] text-fg-subtle">{email} 계정의 새 비밀번호를 입력해 주세요.</p>
      {state.error && <Notice tone="warning">{state.error}</Notice>}
      <FormField label="새 비밀번호" htmlFor="password" hint="8자 이상">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </FormField>
      <FormField label="새 비밀번호 확인" htmlFor="password2">
        <Input id="password2" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={8} />
      </FormField>
      <Button type="submit" variant="primary" size="lg" icon={KeyRound} loading={pending} className="w-full">
        비밀번호 변경
      </Button>
    </form>
  );
}
