"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { updateOrganizationAction, type SettingsActionState } from "./actions";
import type { CurrentOrganization } from "@/lib/auth";
import { CheckCircle2, XCircle } from "lucide-react";

const initialState: SettingsActionState = { error: null };

export function SettingsClient({
  organization,
  userEmail,
  memberCount,
  supabaseConfigured,
  aiConfigured,
  models,
}: {
  organization: CurrentOrganization;
  userEmail: string;
  memberCount: number;
  supabaseConfigured: boolean;
  aiConfigured: boolean;
  models: { chatModel: string; embeddingModel: string; embeddingDimension: number } | null;
}) {
  const [state, action, pending] = useActionState(updateOrganizationAction, initialState);
  const isOwner = organization.role === "owner";

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-violet-600 uppercase">설정</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">워크스페이스 설정</h1>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium text-neutral-900">기업 정보</p>
          <Badge variant="outline">{organization.role === "owner" ? "소유자" : "멤버"}</Badge>
        </div>
        <form action={action} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="name">기업명</Label>
            <Input id="name" name="name" defaultValue={organization.name} disabled={!isOwner} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">업종</Label>
            <Input id="industry" name="industry" defaultValue={organization.industry ?? ""} disabled={!isOwner} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">기업 소개</Label>
            <Textarea id="description" name="description" rows={3} disabled={!isOwner} />
          </div>
          {state.error && <p className="text-sm text-orange-600">{state.error}</p>}
          {isOwner && (
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </Button>
          )}
        </form>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-2 text-sm">
        <p className="font-medium text-neutral-900 mb-2">계정</p>
        <p className="text-neutral-600">로그인 계정: {userEmail}</p>
        <p className="text-neutral-600">워크스페이스 멤버 수: {memberCount}명</p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-3 text-sm">
        <p className="font-medium text-neutral-900 mb-2">시스템 연결 상태</p>
        <ConfigRow label="Supabase 연결" ok={supabaseConfigured} />
        <ConfigRow label="OpenAI API 연결" ok={aiConfigured} />
        {models && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              채팅 모델: {models.chatModel}
            </Badge>
            <Badge variant="outline" className="text-xs">
              임베딩 모델: {models.embeddingModel} ({models.embeddingDimension}차원)
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="size-4 text-emerald-600" />
      ) : (
        <XCircle className="size-4 text-orange-500" />
      )}
      <span className="text-neutral-700">{label}</span>
    </div>
  );
}
