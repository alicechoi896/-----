"use client";

import type { UserFeedback } from "@/lib/types";
import { api } from "@/lib/api-client";
import { findFeature } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, SectionCard, type Column } from "@/components/ui";
import { formatRelative } from "@/lib/utils";

/** Feedback Data: 별로예요 사유와 수정본은 같은 기능의 다음 생성에 "피해야 할 패턴"으로 들어간다 */
export function FeedbackTab() {
  const { data, loading, error, reload } = useAsync(() => api.feedback.list(), []);

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
    <SectionCard title="피드백 (Feedback Data)" description="생성 결과 화면의 좋아요 / 별로예요 / 수정본이 여기에 쌓입니다." flush>
      {loading ? (
        <LoadingState variant="skeleton" rows={3} className="p-5" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} rows={data ?? []} rowKey={(f) => f.id} empty={<EmptyState compact title="피드백이 없습니다" />} />
      )}
    </SectionCard>
  );
}
