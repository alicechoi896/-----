"use client";

import { useActionState } from "react";
import { createOrganizationAction, type OnboardingActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: OnboardingActionState = { error: null };

export default function OnboardingPage() {
  const [state, action, pending] = useActionState(createOrganizationAction, initialState);

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">시작하기</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900">기업 워크스페이스 생성</h1>
        <p className="mt-1 text-sm text-neutral-500">
          AI가 이 워크스페이스의 데이터를 학습해 마케팅 지식과 의사결정 기준을 구축합니다.
        </p>

        <form action={action} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">기업명 *</Label>
            <Input id="name" name="name" required placeholder="예: 주식회사 인더업" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">업종</Label>
            <Input id="industry" name="industry" placeholder="예: 온라인 교육 / 마케팅 SaaS" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">기업 소개</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "생성 중..." : "워크스페이스 만들기"}
          </Button>
        </form>
      </div>
    </div>
  );
}
