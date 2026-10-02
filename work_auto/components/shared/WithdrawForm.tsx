"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserX } from "lucide-react";
import { api, clearApiCache } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Notice } from "@/components/ui/States";

/**
 * 회원 탈퇴 폼 (내 정보, 승인 대기 화면 공용).
 * 비밀번호로 본인 확인 + "탈퇴합니다" 입력으로 실수를 막는다.
 */
export function WithdrawForm({ label = "회원 탈퇴" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.account.withdraw(password);
      clearApiCache();
      router.replace("/login?withdrawn=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "탈퇴 처리에 실패했습니다.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="danger" icon={UserX} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="grid gap-4">
      <Notice tone="warning" title="탈퇴하면 되돌릴 수 없습니다">
        계정과 함께 저장한 제품, 생성 이력, 스타일, 피드백, 연결한 API 키가 모두 즉시 삭제됩니다.
      </Notice>
      {error && <Notice tone="warning">{error}</Notice>}
      <FormField label="현재 비밀번호" htmlFor="withdraw-password">
        <Input id="withdraw-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      <FormField label="확인 문구" htmlFor="withdraw-confirm" hint="'탈퇴합니다'를 그대로 입력해 주세요.">
        <Input id="withdraw-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="탈퇴합니다" />
      </FormField>
      <div className="flex gap-2">
        <Button variant="danger" icon={UserX} loading={busy} disabled={!password || confirmText !== "탈퇴합니다"} onClick={submit}>
          {label}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </div>
  );
}
