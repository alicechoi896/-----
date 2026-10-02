"use client";

import { useState } from "react";
import { KeyRound, UserRound, UserX } from "lucide-react";
import { ROLE_LABEL } from "@/lib/permissions";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Button,
  ErrorState,
  FormField,
  InfoRow,
  Input,
  LoadingState,
  Notice,
  SectionCard,
} from "@/components/ui";
import { WithdrawForm } from "@/components/shared/WithdrawForm";
import { formatDate } from "@/lib/utils";

/** 내 정보: 기본 정보 / 이름 변경 / 비밀번호 변경 / 회원 탈퇴 */
export function AccountSettings({ demo }: { demo: boolean }) {
  const me = useAsync(() => api.account.me(), []);

  if (me.loading) return <LoadingState variant="skeleton" rows={4} />;
  if (me.error || !me.data) return <ErrorState message={me.error ?? "정보를 불러오지 못했습니다."} onRetry={me.reload} />;
  const profile = me.data;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <SectionCard title="기본 정보" icon={UserRound}>
          <dl className="divide-y divide-line">
            <InfoRow label="이메일">{profile.email}</InfoRow>
            <InfoRow label="등급">{ROLE_LABEL[profile.role]}</InfoRow>
            <InfoRow label="가입일">{formatDate(profile.createdAt)}</InfoRow>
            <InfoRow label="승인일">{formatDate(profile.approvedAt)}</InfoRow>
            <InfoRow label="약관 동의">{profile.termsAgreedAt ? formatDate(profile.termsAgreedAt) : "-"}</InfoRow>
          </dl>
          <p className="mt-3 text-xs text-fg-subtle">등급 변경은 관리자에게 문의해 주세요.</p>
        </SectionCard>

        <NameForm initialName={profile.name} onSaved={(next) => me.setData(() => next)} />
      </div>

      <div className="space-y-6">
        <PasswordForm demo={demo} />
        <SectionCard title="회원 탈퇴" icon={UserX} description="탈퇴하면 계정과 모든 데이터가 즉시 삭제되며 되돌릴 수 없습니다.">
          {demo ? <Notice tone="neutral">데모 모드에서는 탈퇴할 수 없습니다.</Notice> : <WithdrawForm />}
        </SectionCard>
      </div>
    </div>
  );
}

function NameForm({ initialName, onSaved }: { initialName: string; onSaved: (p: Awaited<ReturnType<typeof api.account.me>>) => void }) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await api.account.updateName(name));
      setMessage({ tone: "info", text: "이름을 변경했습니다. 사이드바에는 다음 화면 이동부터 반영됩니다." });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "변경에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="이름 변경"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={!name.trim() || name.trim() === initialName} onClick={save}>
            저장
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <FormField label="이름" htmlFor="account-name" hint="30자 이내">
          <Input id="account-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </div>
    </SectionCard>
  );
}

function PasswordForm({ demo }: { demo: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.account.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ tone: "info", text: "비밀번호를 변경했습니다." });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "변경에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="비밀번호 변경"
      icon={KeyRound}
      footer={
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} disabled={demo || !current || next.length < 8 || next !== confirm} onClick={save}>
            비밀번호 변경
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        {demo && <Notice tone="neutral">데모 모드에서는 비밀번호를 바꿀 수 없습니다.</Notice>}
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        <FormField label="현재 비밀번호" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} disabled={demo} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
        <FormField label="새 비밀번호" htmlFor="pw-new" hint="8자 이상">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} disabled={demo} onChange={(e) => setNext(e.target.value)} />
        </FormField>
        <FormField label="새 비밀번호 확인" htmlFor="pw-confirm" error={mismatch ? "새 비밀번호와 일치하지 않습니다." : null}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} disabled={demo} aria-invalid={mismatch} onChange={(e) => setConfirm(e.target.value)} />
        </FormField>
      </div>
    </SectionCard>
  );
}
