"use client";

import { useActionState, useState, useTransition } from "react";
import { signInAction, signUpAction, tryAdminDemoAction, tryUserDemoAction, type AuthActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, UserRound } from "lucide-react";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [signInState, signIn, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUp, signUpPending] = useActionState(signUpAction, initialState);

  const [tryPending, startTry] = useTransition();
  const [tryError, setTryError] = useState<string | null>(null);
  const [tryingAs, setTryingAs] = useState<"admin" | "user" | null>(null);

  const runTry = (which: "admin" | "user") => {
    setTryingAs(which);
    setTryError(null);
    startTry(async () => {
      const result = which === "admin" ? await tryAdminDemoAction() : await tryUserDemoAction();
      if (result.error) setTryError(result.error);
    });
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">자동화 지니</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">자동화 지니 로그인</h1>
        <p className="mt-1 text-sm text-neutral-500">
          기업 데이터를 학습해 마케팅 전략을 판단하는 AI 운영체계입니다.
        </p>

        <div className="mt-6 space-y-2">
          <p className="text-xs font-medium text-neutral-500">
            가입 없이 바로 둘러보기 (무료체험모드)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={tryPending}
              onClick={() => runTry("admin")}
            >
              <ShieldCheck className="size-4" />
              {tryPending && tryingAs === "admin" ? "접속 중..." : "관리자로 체험하기"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={tryPending}
              onClick={() => runTry("user")}
            >
              <UserRound className="size-4" />
              {tryPending && tryingAs === "user" ? "접속 중..." : "일반 사용자로 체험하기"}
            </Button>
          </div>
          {tryError && <p className="text-sm text-orange-600">{tryError}</p>}
          <p className="text-xs text-neutral-400">
            시제품 예시 데이터가 담긴 데모 워크스페이스로 바로 로그인됩니다.
          </p>
        </div>

        <div className="mt-6 pt-6 border-t border-neutral-200">
          <form action={signIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" name="email" type="email" required placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
            {(signInState.error || signUpState.error) && (
              <p className="text-sm text-orange-600">{signInState.error ?? signUpState.error}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={signInPending}>
                {signInPending ? "로그인 중..." : "로그인"}
              </Button>
              <Button
                type="submit"
                variant="outline"
                formAction={signUp}
                className="flex-1"
                disabled={signUpPending}
              >
                {signUpPending ? "가입 중..." : "회원가입"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
