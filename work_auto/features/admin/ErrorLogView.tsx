"use client";

import { useState } from "react";
import { Bug, Trash2 } from "lucide-react";
import type { ErrorLog } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterItem,
  LoadingState,
  SearchInput,
  SectionCard,
  SegmentedControl,
  StatTile,
  type Column,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** 같은 오류(fingerprint)는 한 줄로 묶어 보여 준다 */
type Group = { latest: ErrorLog; count: number; users: Set<string>; all: ErrorLog[] };

/** 오류 기록 (관리자): 서버 API 오류와 화면 오류. 30일 뒤 자동 삭제 */
export function ErrorLogView() {
  const [days, setDays] = useState("7");
  const { data, loading, error, reload, setData } = useAsync(() => api.errors.list(Number(days)), [days]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [open, setOpen] = useState<Group | null>(null);
  // "최근 24시간" 기준 시각 (화면을 연 시각)
  const [now] = useState(() => Date.now());

  const rows = (data ?? []).filter(
    (l) =>
      (source === "all" || l.source === source) &&
      (!query.trim() || `${l.message} ${l.path} ${l.userEmail} ${l.code}`.toLowerCase().includes(query.trim().toLowerCase())),
  );
  const groups = [...rows.reduce((m, l) => {
    const g = m.get(l.fingerprint);
    if (g) {
      g.count++;
      g.all.push(l);
      if (l.userEmail) g.users.add(l.userEmail);
    } else m.set(l.fingerprint, { latest: l, count: 1, users: new Set(l.userEmail ? [l.userEmail] : []), all: [l] });
    return m;
  }, new Map<string, Group>()).values()];
  const last24 = (data ?? []).filter((l) => now - new Date(l.createdAt).getTime() < 86_400_000).length;

  async function removeGroup(g: Group) {
    await api.errors.remove(g.all.map((l) => l.id));
    setData((prev) => prev?.filter((l) => l.fingerprint !== g.latest.fingerprint) ?? null);
    setOpen(null);
  }
  async function clearAll() {
    if (!window.confirm("오류 기록을 모두 지울까요?")) return;
    await api.errors.remove("all");
    reload();
  }

  const columns: Column<Group>[] = [
    { key: "time", header: "마지막 발생", width: "170px", render: (g) => <span className="tabular whitespace-nowrap text-fg-muted">{formatDateTime(g.latest.createdAt)}</span> },
    { key: "source", header: "종류", width: "80px", render: (g) => <Badge tone={g.latest.source === "server" ? "danger" : "warning"}>{g.latest.source === "server" ? "서버" : "화면"}</Badge> },
    {
      key: "message",
      header: "오류",
      render: (g) => (
        <div className="min-w-[260px]">
          <p className="line-clamp-2 text-fg">{g.latest.message}</p>
          <p className="text-xs text-fg-subtle">
            {g.latest.method} {g.latest.path || "-"}
            {g.latest.code ? ` · ${g.latest.code}` : ""}
            {g.latest.status ? ` · ${g.latest.status}` : ""}
          </p>
        </div>
      ),
    },
    { key: "count", header: "횟수", numeric: true, render: (g) => <span className="tabular font-semibold text-fg">{g.count}</span> },
    { key: "users", header: "사용자", render: (g) => <span className="text-xs text-fg-muted">{g.users.size ? [...g.users].slice(0, 2).join(", ") + (g.users.size > 2 ? ` 외 ${g.users.size - 2}` : "") : "-"}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="최근 24시간" value={last24} unit="건" hint="서버·화면 오류" />
        <StatTile label={`최근 ${days}일`} value={data?.length ?? "-"} unit="건" />
        <StatTile label="오류 종류" value={groups.length} unit="가지" hint="같은 오류는 한 줄로 묶음" />
      </div>
      <FilterBar
        actions={
          <Button variant="ghost" icon={Trash2} disabled={!data?.length} onClick={() => void clearAll()}>
            모두 지우기
          </Button>
        }
      >
        <FilterItem label="기간">
          <SegmentedControl value={days} onChange={setDays} options={[{ value: "1", label: "1일" }, { value: "7", label: "7일" }, { value: "30", label: "30일" }]} />
        </FilterItem>
        <FilterItem label="종류">
          <SegmentedControl value={source} onChange={setSource} options={[{ value: "all", label: "전체" }, { value: "server", label: "서버" }, { value: "client", label: "화면" }]} />
        </FilterItem>
        <FilterItem label="검색">
          <SearchInput className="w-60" value={query} onValueChange={setQuery} placeholder="메시지·경로·사용자" />
        </FilterItem>
      </FilterBar>
      <SectionCard title="오류 기록" icon={Bug} description="API 키·토큰 같은 비밀값은 가려서 저장합니다. 30일이 지나면 자동으로 지워집니다." flush>
        {loading ? (
          <LoadingState variant="skeleton" rows={4} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !groups.length ? (
          <EmptyState compact title="기록된 오류가 없습니다" description="문제가 없다는 뜻입니다." />
        ) : (
          <DataTable columns={columns} rows={groups} rowKey={(g) => g.latest.fingerprint} onRowClick={setOpen} />
        )}
      </SectionCard>

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `${open.latest.source === "server" ? "서버" : "화면"} 오류 · ${open.count}회` : ""}
        footer={
          open && (
            <Button variant="ghost" icon={Trash2} className="w-full" onClick={() => void removeGroup(open)}>
              이 오류 기록 지우기 (해결함)
            </Button>
          )
        }
      >
        {open && (
          <div className="space-y-4 text-sm">
            <p className="font-medium text-fg">{open.latest.message}</p>
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-fg-subtle">위치</dt>
              <dd className="break-all text-fg-muted">{open.latest.method} {open.latest.path || "-"}</dd>
              <dt className="text-fg-subtle">코드</dt>
              <dd className="text-fg-muted">{open.latest.code || "-"} {open.latest.status ?? ""}</dd>
              <dt className="text-fg-subtle">처음·마지막</dt>
              <dd className="text-fg-muted">{formatDateTime(open.all.at(-1)!.createdAt)} ~ {formatDateTime(open.latest.createdAt)}</dd>
              <dt className="text-fg-subtle">사용자</dt>
              <dd className="text-fg-muted">{[...open.users].join(", ") || "-"}</dd>
              <dt className="text-fg-subtle">브라우저</dt>
              <dd className="break-all text-xs text-fg-subtle">{open.latest.userAgent || "-"}</dd>
            </dl>
            {open.latest.stack && (
              <div>
                <p className="mb-1 text-xs font-semibold text-fg-subtle">자세한 위치 (개발자용)</p>
                <pre className="max-h-80 overflow-auto rounded-control bg-subtle p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-fg-muted">{open.latest.stack}</pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
