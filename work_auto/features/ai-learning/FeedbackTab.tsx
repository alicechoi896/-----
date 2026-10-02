"use client";

import { useState } from "react";
import type { UserFeedback } from "@/lib/types";
import { api } from "@/lib/api-client";
import { findFeature } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, BulkDeleteButton, DataTable, EmptyState, ErrorState, LoadingState, SectionCard, type Column } from "@/components/ui";
import { formatRelative } from "@/lib/utils";

/** Feedback Data: 별로예요 사유와 수정본은 같은 기능의 다음 생성에 "피해야 할 패턴"으로 들어간다 */
export function FeedbackTab({ onChanged }: { onChanged?: () => void }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.feedback.list(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function deleteSelected() {
    const ids = [...selected];
    await api.memory.deleteMany("feedback", ids);
    const gone = new Set(ids);
    setData((prev) => prev?.filter((x) => !gone.has(x.id)) ?? null);
    setSelected(new Set());
    onChanged?.();
  }

  const columns: Column<UserFeedback>[] = [
    {
      key: "rating",
      header: "평가",
      width: "96px",
      render: (f) => (f.rating === "up" ? <Badge tone="success" dot>좋아요</Badge> : <Badge tone="danger" dot>별로예요</Badge>),
    },
    { key: "feature", header: "기능", render: (f) => <span className="text-fg-muted">{findFeature(f.featureId)?.title ?? f.featureId}</span> },
    { key: "reason", header: "사유", render: (f) => <span className="text-fg">{f.reason ?? "-"}</span> },
    {
      key: "edited",
      header: "사용자 수정본",
      render: (f) =>
        f.editedOutput ? (
          <span className="text-[13px] text-fg-muted">{Object.values(f.editedOutput).flat().join(" / ")}</span>
        ) : (
          <span className="text-fg-subtle">-</span>
        ),
    },
    { key: "createdAt", header: "시각", render: (f) => <span className="whitespace-nowrap text-fg-muted">{formatRelative(f.createdAt)}</span> },
  ];

  return (
    <SectionCard
      title="피드백 (Feedback Data)"
      description="생성 결과 화면의 좋아요 / 별로예요 / 수정본이 여기에 쌓입니다. 삭제한 피드백은 다음 생성에 반영되지 않습니다."
      actions={<BulkDeleteButton count={selected.size} noun="피드백" onDelete={deleteSelected} onClear={() => setSelected(new Set())} />}
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
          rowKey={(f) => f.id}
          selection={{ selected, onChange: setSelected }}
          empty={<EmptyState compact title="피드백이 없습니다" />}
        />
      )}
    </SectionCard>
  );
}
