"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Trash2 } from "lucide-react";
import type { Product } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterItem,
  IconButton,
  LinkButton,
  LoadingState,
  SearchInput,
  SectionCard,
  SegmentedControl,
  Select,
  type Column,
} from "@/components/ui";
import { CreateContentMenu, ProductCard } from "@/components/shared/ProductCard";
import { formatDate, formatRelative } from "@/lib/utils";

/**
 * 제품 라이브러리 — 분석한 제품을 저장·재사용한다.
 * 콘텐츠 생성 시 상세페이지를 다시 분석하지 않고 여기 저장된 분석을 그대로 쓴다.
 */
export function ProductLibrary() {
  const { data, loading, error, reload, setData } = useAsync(() => api.products.list(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<"card" | "list">("card");

  const products = useMemo(() => data ?? [], [data]);
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).map((c) => ({ value: c, label: c })),
    [products],
  );
  const filtered = products.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || `${p.name} ${p.brand} ${p.tags.join(" ")}`.toLowerCase().includes(q);
    return matchQ && (!category || p.category === category);
  });

  async function handleDelete(product: Product) {
    if (!window.confirm(`'${product.name}'을(를) 삭제할까요?\n분석 데이터도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    await api.products.remove(product.id);
    setData((prev) => prev?.filter((p) => p.id !== product.id) ?? null);
  }

  const columns: Column<Product>[] = [
    {
      key: "name",
      header: "제품",
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <Link href={`/tools/product-library/${p.id}`} className="font-medium text-fg hover:text-brand">
              {p.name}
            </Link>
            <p className="text-xs text-fg-subtle">{p.brand}</p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "카테고리", render: (p) => <span className="text-fg-muted">{p.category}</span> },
    { key: "benefit", header: "주요 장점", render: (p) => <span className="line-clamp-1 text-fg-muted">{p.keyBenefits[0]}</span> },
    { key: "createdAt", header: "저장일", render: (p) => <span className="tabular text-fg-muted">{formatDate(p.createdAt)}</span> },
    { key: "lastUsedAt", header: "최근 사용", render: (p) => <span className="text-fg-muted">{p.lastUsedAt ? formatRelative(p.lastUsedAt) : "사용 전"}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <CreateContentMenu productId={p.id} />
          <IconButton icon={Trash2} label="삭제" onClick={() => handleDelete(p)} className="hover:text-danger" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <FilterBar
        actions={
          <>
            <SegmentedControl
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "card", label: "카드 보기", icon: LayoutGrid },
                { value: "list", label: "목록 보기", icon: List },
              ]}
            />
            <LinkButton href="/tools/product-learning" variant="primary" icon={Plus}>
              제품 추가
            </LinkButton>
          </>
        }
      >
        <FilterItem label="검색">
          <SearchInput className="w-64" value={query} onValueChange={setQuery} placeholder="제품명, 브랜드, 태그" />
        </FilterItem>
        <FilterItem label="카테고리">
          <Select className="w-52" value={category} options={categories} placeholder="전체" onChange={(e) => setCategory(e.target.value)} />
        </FilterItem>
      </FilterBar>

      {loading ? (
        <LoadingState variant="skeleton" rows={4} />
      ) : error ? (
        <SectionCard>
          <ErrorState message={error} onRetry={reload} />
        </SectionCard>
      ) : products.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="저장된 제품이 없습니다"
            description="제품 상세페이지 학습에서 제품을 분석하고 저장하면 여기에 쌓입니다."
            action={<LinkButton href="/tools/product-learning" variant="primary" icon={Plus}>제품 학습하기</LinkButton>}
          />
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <EmptyState title="검색 결과가 없습니다" description="다른 검색어나 카테고리로 찾아보세요." />
        </SectionCard>
      ) : view === "card" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.id} product={p} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <SectionCard flush>
          <DataTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
        </SectionCard>
      )}
    </div>
  );
}
