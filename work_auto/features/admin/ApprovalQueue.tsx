"use client";

import { useState } from "react";
import { Check, UserCheck, X } from "lucide-react";
import { MEMBER_ROLES, ROLE_LABEL } from "@/lib/permissions";
import type { MemberRole, UserProfile } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  SectionCard,
  Select,
  Tabs,
  type Column,
} from "@/components/ui";
import { formatDate, formatRelative } from "@/lib/utils";

const ROLE_OPTIONS = MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/**
 * 가입 승인: 승인 대기 / 거절됨 목록.
 * 승인할 때 등급을 고른다 (기본 실버). 거절된 사용자도 나중에 다시 승인할 수 있다.
 */
export function ApprovalQueue() {
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.users(), []);
  const [tab, setTab] = useState<"pending" | "rejected">("pending");
  const [roles, setRoles] = useState<Record<string, MemberRole>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  const users = data ?? [];
  const pending = users.filter((u) => u.status === "pending");
  const rejected = users.filter((u) => u.status === "rejected");
  const rows = tab === "pending" ? pending : rejected;

  function replace(next: UserProfile) {
    setData((prev) => prev?.map((u) => (u.id === next.id ? next : u)) ?? null);
  }

  async function approve(user: UserProfile) {
    const role = roles[user.id] ?? "silver";
    setBusyId(user.id);
    setMessage(null);
    try {
      replace(await api.admin.approve(user.id, role));
      setMessage({ tone: "info", text: `${user.name}님을 ${ROLE_LABEL[role]} 등급으로 승인했습니다.` });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "승인에 실패했습니다." });
    } finally {
      setBusyId(null);
    }
  }

  async function reject(user: UserProfile) {
    const reason = window.prompt(`${user.name}님의 가입을 거절합니다.\n거절 사유를 입력하세요 (선택, 활동 기록에만 남습니다).`, "");
    if (reason === null) return;
    setBusyId(user.id);
    setMessage(null);
    try {
      replace(await api.admin.reject(user.id, reason));
      setMessage({ tone: "info", text: `${user.name}님의 가입을 거절했습니다.` });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "거절에 실패했습니다." });
    } finally {
      setBusyId(null);
    }
  }

  const columns: Column<UserProfile>[] = [
    {
      key: "name",
      header: "신청자",
      render: (u) => (
        <div>
          <p className="font-medium text-fg">{u.name}</p>
          <p className="text-xs text-fg-subtle">{u.email}</p>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "가입 신청",
      render: (u) => (
        <div className="whitespace-nowrap">
          <p className="tabular text-fg-muted">{formatDate(u.createdAt)}</p>
          <p className="text-xs text-fg-subtle">{formatRelative(u.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "terms",
      header: "약관 동의",
      render: (u) => (u.termsAgreedAt ? <Badge tone="success" dot>동의</Badge> : <Badge>기록 없음</Badge>),
    },
    {
      key: "role",
      header: "승인 등급",
      width: "170px",
      render: (u) => (
        <Select
          aria-label={`${u.name} 승인 등급`}
          className="w-32"
          value={roles[u.id] ?? "silver"}
          options={ROLE_OPTIONS}
          onChange={(e) => setRoles((prev) => ({ ...prev, [u.id]: e.target.value as MemberRole }))}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (u) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="primary" icon={Check} loading={busyId === u.id} onClick={() => approve(u)}>
            {tab === "pending" ? "승인" : "다시 승인"}
          </Button>
          {tab === "pending" && (
            <Button size="sm" variant="danger" icon={X} disabled={busyId === u.id} onClick={() => reject(u)}>
              거절
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Notice tone="info" icon={UserCheck} title="가입 승인 방식">
        회원가입한 사용자는 관리자가 승인하기 전까지 어떤 메뉴도 사용할 수 없고 &lsquo;승인 대기&rsquo; 안내만 봅니다. 승인할 때 등급을 정하며,
        등급은 나중에 사용자 관리에서 바꿀 수 있습니다.
      </Notice>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div>
        <Tabs
          items={[
            { value: "pending", label: "승인 대기", count: pending.length },
            { value: "rejected", label: "거절됨", count: rejected.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SectionCard className="mt-4" flush>
          {loading ? (
            <LoadingState variant="skeleton" rows={3} className="p-5" />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(u) => u.id}
              empty={
                <EmptyState
                  compact
                  icon={UserCheck}
                  title={tab === "pending" ? "승인을 기다리는 가입 신청이 없습니다" : "거절한 사용자가 없습니다"}
                />
              }
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
