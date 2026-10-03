"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { PerformanceMetric } from "@/lib/types";
import { api } from "@/lib/api-client";
import { getChannel } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, BulkDeleteButton, DataTable, EmptyState, ErrorState, LoadingState, Notice, SectionCard, type Column } from "@/components/ui";
import { formatNumber } from "@/lib/utils";

type Row = PerformanceMetric & { headline: string };
const num = (v: number | null, suffix = "") => (v == null ? "-" : `${formatNumber(v)}${suffix}`);
const SOURCE = { manual: "수동 입력", "youtube-analytics": "YouTube Analytics", "youtube-d1": "YouTube 1일 후 (자동)", "youtube-d7": "YouTube 7일 후 (자동)", naver: "NAVER", mock: "Mock" } as const;

/** Performance Data: 성과 상위 콘텐츠의 특징이 같은 채널의 다음 생성에 힌트로 들어간다 */
export function PerformanceTab({ onChanged }: { onChanged?: () => void }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.memory.performance(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function deleteSelected() {
    const ids = [...selected];
    await api.memory.deleteMany("performance", ids);
    const gone = new Set(ids);
    setData((prev) => prev?.filter((x) => !gone.has(x.id)) ?? null);
    setSelected(new Set());
    onChanged?.();
  }

  const columns: Column<Row>[] = [
    { key: "headline", header: "콘텐츠", render: (r) => <span className="line-clamp-1 min-w-[220px] font-medium text-fg">{r.headline}</span> },
    { key: "channel", header: "채널", render: (r) => <span className="text-fg-muted">{getChannel(r.channelId).name}</span> },
    { key: "views", header: "조회수", numeric: true, render: (r) => num(r.views) },
    { key: "clicks", header: "클릭", numeric: true, render: (r) => num(r.clicks) },
    { key: "ctr", header: "CTR", numeric: true, render: (r) => (r.ctr == null ? "-" : `${r.ctr}%`) },
    { key: "conversions", header: "전환", numeric: true, render: (r) => num(r.conversions) },
    { key: "revenue", header: "매출", numeric: true, render: (r) => num(r.revenue, "원") },
    { key: "source", header: "출처", render: (r) => <Badge>{SOURCE[r.source]}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <Notice tone="info" icon={Info} title="성과 데이터 자동 수집은 다음 단계에서 연동합니다">
        YouTube Analytics, 블로그 통계, 판매 데이터를 연결하면 이 표가 자동으로 채워집니다. 현재는 Mock/수동 입력 데이터입니다.
      </Notice>
      <SectionCard
        title="성과 데이터 (Performance Data)"
        actions={<BulkDeleteButton count={selected.size} noun="성과 데이터" onDelete={deleteSelected} onClear={() => setSelected(new Set())} />}
        flush
      >
        {loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={data ?? []}
            rowKey={(r) => r.id}
            selection={{ selected, onChange: setSelected }}
            empty={<EmptyState compact title="성과 데이터가 없습니다" />}
          />
        )}
      </SectionCard>
    </div>
  );
}
