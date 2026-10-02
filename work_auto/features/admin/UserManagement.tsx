"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { MEMBER_ROLES, ROLE_LABEL } from "@/lib/permissions";
import type { MemberRole, UserProfile } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Notice,
  SearchInput,
  SectionCard,
  Select,
  StatTile,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

const ROLE_OPTIONS = MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** 사용자 관리: 목록 + 역할 변경 */
export function UserManagement({ currentUserId }: { currentUserId: string }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.users(), []);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  // 승인된 사용자만 (승인 대기·거절은 가입 승인 화면에서 관리)
  const users = (data ?? []).filter((u) => u.status === "active");
  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    return !q || `${u.name} ${u.email}`.toLowerCase().includes(q);
  });
  const count = (role: MemberRole) => users.filter((u) => u.role === role).length;

  async function changeRole(user: UserProfile, role: MemberRole) {
    if (role === user.role) return;
    setSavingId(user.id);
    setMessage(null);
    try {
      const next = await api.admin.updateRole(user.id, role);
      setData((prev) => prev?.map((u) => (u.id === next.id ? next : u)) ?? null);
      setMessage({ tone: "info", text: `${user.name}님의 역할을 ${ROLE_LABEL[role]}(으)로 변경했습니다.` });
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "변경에 실패했습니다." });
    } finally {
      setSavingId(null);
    }
  }

  const columns: Column<UserProfile>[] = [
    {
      key: "name",
      header: "사용자",
      render: (u) => (
        <div>
          <p className="font-medium text-fg">
            {u.name}
            {u.id === currentUserId && <Badge className="ml-2">나</Badge>}
          </p>
          <p className="text-xs text-fg-subtle">{u.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "역할",
      width: "180px",
      render: (u) => (
        <Select
          aria-label={`${u.name} 역할`}
          className="w-36"
          value={u.role}
          options={ROLE_OPTIONS}
          disabled={savingId === u.id || u.id === currentUserId}
          onChange={(e) => changeRole(u, e.target.value as MemberRole)}
        />
      ),
    },
    { key: "approvedAt", header: "승인일", render: (u) => <span className="tabular text-fg-muted">{formatDate(u.approvedAt)}</span> },
    { key: "createdAt", header: "가입일", render: (u) => <span className="tabular text-fg-muted">{formatDate(u.createdAt)}</span> },
    { key: "updatedAt", header: "최근 변경", render: (u) => <span className="tabular text-fg-muted">{formatDate(u.updatedAt)}</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {MEMBER_ROLES.map((r) => (
          <StatTile key={r} label={ROLE_LABEL[r]} value={loading ? "-" : count(r)} unit="명" />
        ))}
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <SectionCard
        title="사용자 목록"
        icon={Users}
        description="승인된 사용자입니다. 역할을 바꾸면 다음 화면 이동부터 바로 적용되고 활동 기록에 남습니다. 자기 자신의 역할은 바꿀 수 없습니다."
        actions={<SearchInput className="w-60" value={query} onValueChange={setQuery} placeholder="이름, 이메일" />}
        flush
      >
        {loading ? (
          <LoadingState variant="skeleton" rows={4} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(u) => u.id}
            empty={<EmptyState compact title={users.length ? "검색 결과가 없습니다" : "가입한 사용자가 없습니다"} />}
          />
        )}
      </SectionCard>
    </div>
  );
}
