"use client";

import { useActionState } from "react";
import { signInAction, signUpAction, demoSignInAction, type AuthActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = { error: null };

export default function LoginPage() {
  const [signInState, signIn, signInPending] = useActionState(signInAction, initialState);
  const [signUpState, signUp, signUpPending] = useActionState(signUpAction, initialState);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">
          jini-ai-marketing-brain
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">AI 마케팅 브레인 로그인</h1>
        <p className="mt-1 text-sm text-neutral-500">
          기업 데이터를 학습해 마케팅 전략을 판단하는 AI 운영체계입니다.
        </p>

        <form action={signIn} className="mt-6 space-y-4">
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

        {isDev && (
          <div className="mt-6 pt-6 border-t border-dashed border-neutral-200">
            <form
              action={async () => {
                await demoSignInAction();
              }}
            >
              <Button type="submit" variant="secondary" className="w-full">
                개발용 데모 로그인 (인더업 시연 워크스페이스)
              </Button>
            </form>
            <p className="mt-2 text-xs text-neutral-400">
              이 버튼은 개발 환경에서만 표시되며 운영 환경에서는 동작하지 않습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
