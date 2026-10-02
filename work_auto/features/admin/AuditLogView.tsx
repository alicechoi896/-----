"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { AUDIT_ACTION_LABEL, AUDIT_GROUPS, describeAudit } from "@/lib/audit-labels";
import type { AuditLog } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterItem,
  LoadingState,
  SearchInput,
  SectionCard,
  Select,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

const TONE: Record<string, "brand" | "success" | "danger" | "warning" | "neutral"> = {
  "user.approve": "success",
  "user.reject": "danger",
  "user.role_change": "brand",
  "permission.change": "warning",
  "permission.reset": "warning",
  "account.withdraw": "danger",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 활동 기록: 누가, 언제, 무엇을, 누구에게 했는지 (관리자 전용) */
export function AuditLogView() {
  const { data, loading, error, reload } = useAsync(() => api.admin.auditLogs(), []);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");

  const actions = AUDIT_GROUPS.find((g) => g.value === group)?.actions;
  const rows = (data ?? []).filter((l) => {
    if (actions && !actions.includes(l.action)) return false;
    const q = query.trim().toLowerCase();
    return !q || `${l.actorName} ${l.actorEmail} ${l.targetLabel ?? ""}`.toLowerCase().includes(q);
  });

  const columns: Column<AuditLog>[] = [
    { key: "createdAt", header: "시각", width: "150px", render: (l) => <span className="tabular whitespace-nowrap text-fg-muted">{formatDateTime(l.createdAt)}</span> },
    {
      key: "actor",
      header: "수행자",
      render: (l) => (
        <div>
          <p className="text-fg">{l.actorName}</p>
          <p className="text-xs text-fg-subtle">{l.actorEmail}</p>
        </div>
      ),
    },
    { key: "action", header: "활동", render: (l) => <Badge tone={TONE[l.action] ?? "neutral"}>{AUDIT_ACTION_LABEL[l.action] ?? l.action}</Badge> },
    { key: "target", header: "대상", render: (l) => <span className="text-fg-muted">{l.targetLabel ?? "-"}</span> },
    { key: "detail", header: "내용", render: (l) => <span className="text-fg-muted">{describeAudit(l) || "-"}</span> },
  ];

  return (
    <div className="space-y-5">
      <FilterBar>
        <FilterItem label="종류">
          <Select
            className="w-44"
            value={group}
            options={AUDIT_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
            placeholder="전체"
            onChange={(e) => setGroup(e.target.value)}
          />
        </FilterItem>
        <FilterItem label="검색">
          <SearchInput className="w-64" value={query} onValueChange={setQuery} placeholder="수행자, 대상" />
        </FilterItem>
      </FilterBar>

      <SectionCard title="활동 기록" icon={ScrollText} description={data ? `전체 ${data.length}건 중 ${rows.length}건` : undefined} flush>
        {loading ? (
          <LoadingState variant="skeleton" rows={5} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(l) => l.id} empty={<EmptyState compact title="기록이 없습니다" />} />
        )}
      </SectionCard>
    </div>
  );
}
