"use client";

import { Star } from "lucide-react";
import type { GeneratedContent } from "@/lib/types";
import { api } from "@/lib/api-client";
import { findFeature } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, SectionCard, type Column } from "@/components/ui";
import { cn, formatRelative } from "@/lib/utils";

/** Content History: 과거 생성물. ★(좋은 결과)는 같은 기능의 다음 생성에 few-shot 예시로 쓰인다 */
export function ContentHistoryTab() {
  const { data, loading, error, reload, setData } = useAsync(() => api.contents.list(), []);

  async function toggleExemplar(c: GeneratedContent) {
    const next = await api.contents.setExemplar(c.id, !c.isExemplar);
    setData((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? null);
  }

  const columns: Column<GeneratedContent>[] = [
    {
      key: "exemplar",
      header: "좋은 결과",
      width: "84px",
      align: "center",
      render: (c) => (
        <button
          type="button"
          aria-label={c.isExemplar ? "좋은 결과 해제" : "좋은 결과로 저장"}
          aria-pressed={c.isExemplar}
          onClick={() => toggleExemplar(c)}
          className="rounded p-1 hover:bg-muted"
        >
          <Star className={cn("size-4", c.isExemplar ? "fill-warning text-warning" : "text-fg-subtle")} />
        </button>
      ),
    },
    {
      key: "headline",
      header: "대표 제목",
      render: (c) => (
        <div className="min-w-[240px]">
          <p className="line-clamp-1 font-medium text-fg">{c.headline}</p>
          <p className="text-xs text-fg-subtle">{findFeature(c.featureId)?.title ?? c.featureId}</p>
        </div>
      ),
    },
    { key: "product", header: "제품", render: (c) => <span className="text-fg-muted">{c.context.product?.name ?? "-"}</span> },
    {
      key: "context",
      header: "사용된 Context",
      render: (c) => (
        <span className="text-xs text-fg-subtle">
          {[c.context.profile && `프로필:${c.context.profile.name}`, c.context.style && `스타일:${c.context.style.name}`, c.context.exemplars.length && `예시 ${c.context.exemplars.length}`, c.context.trend && "트렌드"]
            .filter(Boolean)
            .join(" · ") || "-"}
        </span>
      ),
    },
    { key: "prompt", header: "프롬프트", render: (c) => <span className="tabular text-xs text-fg-muted">v{c.promptVersion}</span> },
    {
      key: "rating",
      header: "평가",
      render: (c) => (c.rating === "up" ? <Badge tone="success">좋아요</Badge> : c.rating === "down" ? <Badge tone="danger">별로예요</Badge> : <span className="text-fg-subtle">-</span>),
    },
    { key: "createdAt", header: "생성", render: (c) => <span className="whitespace-nowrap text-fg-muted">{formatRelative(c.createdAt)}</span> },
  ];

  return (
    <SectionCard title="콘텐츠 히스토리 (Content History)" description="★를 누르면 '좋은 결과'로 저장되어 같은 기능의 다음 생성에 예시로 쓰입니다." flush>
      {loading ? (
        <LoadingState variant="skeleton" rows={4} className="p-5" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} rows={data ?? []} rowKey={(c) => c.id} empty={<EmptyState compact title="생성 이력이 없습니다" />} />
      )}
    </SectionCard>
  );
}
