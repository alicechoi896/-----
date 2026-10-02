"use client";

import { Fragment, useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { MEMBER_TIERS, ROLE_LABEL, type PermissionRow } from "@/lib/permissions";
import type { MemberTier } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, Button, Checkbox, ErrorState, LoadingState, Notice, SectionCard } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * 권한 관리: 메뉴(기능) × 등급 체크 표.
 * - 행은 Feature Registry 에서 자동으로 만들어진다 → 기능을 추가하면 여기에도 바로 나타난다.
 * - 체크하지 않은 칸은 Registry 의 defaultTiers 를 따른다. 바꾼 칸에는 "변경됨" 점이 표시된다.
 * - 관리자는 항상 모든 메뉴에 접근한다 (수정 불가).
 */
export function PermissionMatrix() {
  const { data, loading, error, reload, setData } = useAsync(() => api.admin.permissions(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(row: PermissionRow, tier: MemberTier, allowed: boolean) {
    setBusy(`${tier}:${row.key}`);
    setMessage(null);
    try {
      const next = await api.admin.setPermission(tier, row.key, allowed);
      setData(() => next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장에 실패했습니다.");
      reload();
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (!window.confirm("모든 권한을 기본값으로 되돌릴까요?")) return;
    setBusy("reset");
    try {
      const next = await api.admin.resetPermissions();
      setData(() => next);
    } finally {
      setBusy(null);
    }
  }

  const rows = data ?? [];
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const changedCount = rows.reduce((n, r) => n + MEMBER_TIERS.filter((t) => r.customized[t]).length, 0);

  return (
    <div className="space-y-5">
      <Notice tone="info" icon={ShieldCheck} title="권한은 이렇게 정해집니다">
        관리자는 항상 모든 메뉴를 사용할 수 있습니다. 실버·골드·VIP는 이 표에서 체크한 메뉴만 사이드바에 보이고 사용할 수 있습니다.
        새 메뉴를 추가하면 개발할 때 정한 기본 등급으로 이 표에 자동으로 나타납니다.
      </Notice>
      {message && <Notice tone="warning">{message}</Notice>}

      <SectionCard
        title="등급별 접근 권한"
        description={changedCount ? `기본값에서 바뀐 칸 ${changedCount}개` : "모두 기본값을 사용 중입니다."}
        actions={
          <Button size="sm" icon={RotateCcw} disabled={!changedCount || busy !== null} loading={busy === "reset"} onClick={reset}>
            기본값으로 되돌리기
          </Button>
        }
        flush
      >
        {loading ? (
          <LoadingState variant="skeleton" rows={8} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-xs text-fg-subtle">
                  <th className="py-2.5 pr-3 pl-5 text-left font-medium">메뉴</th>
                  <th className="w-24 px-3 py-2.5 text-center font-medium">{ROLE_LABEL.admin}</th>
                  {MEMBER_TIERS.map((t) => (
                    <th key={t} className="w-24 px-3 py-2.5 text-center font-medium">
                      {ROLE_LABEL[t]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <tr className="border-b border-line bg-subtle/50">
                      <td colSpan={2 + MEMBER_TIERS.length} className="py-2 pl-5 text-xs font-semibold text-fg-muted">
                        {group}
                      </td>
                    </tr>
                    {rows
                      .filter((r) => r.group === group)
                      .map((r) => (
                        <tr key={r.key} className="border-b border-line last:border-b-0 hover:bg-subtle/60">
                          <td className="py-2.5 pr-3 pl-5">
                            <span className="text-fg">{r.title}</span>
                            {r.planned && <Badge className="ml-2">준비 중</Badge>}
                            <span className="ml-2 text-xs text-fg-subtle">{r.href}</span>
                          </td>
                          <td className="px-3 text-center">
                            <Checkbox checked disabled label={`관리자 · ${r.title}`} />
                          </td>
                          {MEMBER_TIERS.map((t) => (
                            <td key={t} className="relative px-3 text-center">
                              <Checkbox
                                checked={r.allowed[t]}
                                disabled={busy !== null}
                                label={`${ROLE_LABEL[t]} · ${r.title}`}
                                onChange={(v) => toggle(r, t, v)}
                              />
                              <span
                                className={cn(
                                  "absolute top-1/2 ml-1.5 size-1.5 -translate-y-1/2 rounded-full bg-warning",
                                  !r.customized[t] && "invisible",
                                )}
                                title="기본값에서 변경됨"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
