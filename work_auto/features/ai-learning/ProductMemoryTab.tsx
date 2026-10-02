"use client";

import Link from "next/link";
import type { Product } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { DataTable, EmptyState, ErrorState, LinkButton, LoadingState, SectionCard, Tag, type Column } from "@/components/ui";
import { formatDate, formatRelative } from "@/lib/utils";

/** Product Memory: 제품별 고정 정보. 편집은 제품 라이브러리에서 한다 */
export function ProductMemoryTab() {
  const { data, loading, error, reload } = useAsync(() => api.products.list(), []);

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "제품",
      render: (p) => (
        <Link href={`/tools/product-library/${p.id}`} className="font-medium text-fg hover:text-brand">
          {p.name}
        </Link>
      ),
    },
    { key: "oneLiner", header: "한 줄 설명 (Context 로 주입)", render: (p) => <span className="line-clamp-1 text-fg-muted">{p.oneLiner}</span> },
    {
      key: "tags",
      header: "태그",
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          {p.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      ),
    },
    { key: "createdAt", header: "저장일", render: (p) => <span className="tabular text-fg-muted">{formatDate(p.createdAt)}</span> },
    { key: "lastUsedAt", header: "최근 사용", render: (p) => <span className="text-fg-muted">{p.lastUsedAt ? formatRelative(p.lastUsedAt) : "사용 전"}</span> },
  ];

  return (
    <SectionCard
      title="제품 데이터 (Product Memory)"
      description="제품 상세페이지 학습으로 만든 구조화 데이터입니다. 콘텐츠 생성 시 상세페이지를 다시 분석하지 않고 이 데이터를 씁니다."
      actions={<LinkButton href="/tools/product-library" size="sm">제품 라이브러리 열기</LinkButton>}
      flush
    >
      {loading ? (
        <LoadingState variant="skeleton" rows={3} className="p-5" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} rows={data ?? []} rowKey={(p) => p.id} empty={<EmptyState compact title="저장된 제품이 없습니다" />} />
      )}
    </SectionCard>
  );
}
