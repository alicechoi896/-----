"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Database, History, Pencil, Trash2 } from "lucide-react";
import type { ProductDetail } from "@/lib/types";
import { api } from "@/lib/api-client";
import { findFeature } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  InfoRow,
  Input,
  LoadingState,
  SectionCard,
  Textarea,
} from "@/components/ui";
import { CreateContentMenu } from "@/components/shared/ProductCard";
import { ProductAnalysisView } from "@/components/shared/ProductAnalysisView";
import { formatDate, formatRelative } from "@/lib/utils";
import { ProductVideos } from "./ProductVideos";
import { RelearnButton } from "./RelearnButton";

/** 제품 상세: 저장된 모든 분석 데이터 + 연결된 영상(샤오홍슈 다시 받기) + 원본 수집 데이터 + 이 제품으로 만든 콘텐츠 */
export function ProductDetailView({ productId, initialMode }: { productId: string; initialMode: "view" | "edit" }) {
  const router = useRouter();
  const detail = useAsync(() => api.products.get(productId), [productId]);
  const contents = useAsync(() => api.contents.list({ productId }), [productId]);
  const [editing, setEditing] = useState(initialMode === "edit");

  if (detail.loading) return <LoadingState variant="skeleton" rows={6} />;
  if (detail.error || !detail.data)
    return (
      <SectionCard>
        <ErrorState message={detail.error ?? "제품을 찾을 수 없습니다."} onRetry={detail.reload} />
      </SectionCard>
    );

  const { product, analysis, source } = detail.data;

  async function handleDelete() {
    if (!window.confirm(`'${product.name}'을(를) 삭제할까요?`)) return;
    await api.products.remove(product.id);
    router.push("/tools/product-library");
  }

  return (
    <div className="space-y-6">
      {/* 요약 헤더 */}
      <div className="flex flex-wrap items-center gap-5 rounded-card border border-line bg-canvas p-5 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-subtle">
            {product.brand} · {product.category} · {product.seller}
          </p>
          <h2 className="mt-1 text-lg font-bold text-fg">{product.name}</h2>
          <p className="mt-1 text-sm text-fg-muted">{product.oneLiner}</p>
          <p className="tabular mt-2 text-xs text-fg-subtle">
            저장 {formatDate(product.createdAt)} · 최근 사용 {product.lastUsedAt ? formatRelative(product.lastUsedAt) : "사용 전"} · 분석 v
            {analysis.version} ({analysis.meta.provider}/{analysis.meta.model})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RelearnButton detail={detail.data} onDone={(next) => detail.setData(() => next)} />
          <Button icon={Pencil} onClick={() => setEditing((v) => !v)}>
            {editing ? "수정 닫기" : "수정"}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={handleDelete}>
            삭제
          </Button>
          <CreateContentMenu productId={product.id} size="md" />
        </div>
      </div>

      {(source?.raw.imageUrls?.length ?? 0) > 0 && (
        <div className="flex gap-2 overflow-x-auto" data-product-images>
          {source!.raw.imageUrls.slice(0, 5).map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="block size-28 shrink-0 overflow-hidden rounded-control border border-line bg-subtle" title={`제품 사진 ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 쇼핑몰 이미지 서버 주소 그대로 (저장하지 않음) */}
              <img src={u} alt={`제품 사진 ${i + 1}`} referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {editing && (
        <EditForm
          detail={detail.data}
          onSaved={(next) => {
            detail.setData(() => next);
            setEditing(false);
          }}
        />
      )}

      <ProductVideos productId={product.id} />

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_340px]">
        <ProductAnalysisView analysis={analysis} />

        <div className="space-y-4">
          <SectionCard title="이 제품으로 만든 콘텐츠" icon={History} flush>
            {contents.loading ? (
              <LoadingState variant="skeleton" rows={2} className="p-5" />
            ) : !contents.data?.length ? (
              <EmptyState compact title="아직 만든 콘텐츠가 없습니다" />
            ) : (
              <ul className="divide-y divide-line">
                {contents.data.map((c) => (
                  <li key={c.id} className="px-5 py-3">
                    <p className="line-clamp-2 text-sm font-medium text-fg">{c.headline}</p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {findFeature(c.featureId)?.title} · {formatRelative(c.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="원본 수집 데이터" icon={Database} description="Collector가 수집한 원문 (Raw Product Data)">
            {source ? (
              <dl className="divide-y divide-line text-sm">
                <InfoRow label="수집 방식">{source.raw.collectedBy}</InfoRow>
                <InfoRow label="수집 시각">{formatDate(source.raw.collectedAt)}</InfoRow>
                {Object.entries(source.raw.specs).map(([k, v]) => (
                  <InfoRow key={k} label={k}>
                    {v}
                  </InfoRow>
                ))}
                <div className="pt-3">
                  <p className="mb-1.5 text-xs font-semibold text-fg-subtle">설명 원문</p>
                  <p className="max-h-48 overflow-y-auto rounded-control bg-subtle px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
                    {source.raw.descriptionText}
                  </p>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-fg-subtle">원본 데이터가 없습니다.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

const toLines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

function EditForm({ detail, onSaved }: { detail: ProductDetail; onSaved: (next: ProductDetail) => void }) {
  const { product, analysis } = detail;
  const [name, setName] = useState(product.name);
  const [oneLiner, setOneLiner] = useState(product.oneLiner);
  const [benefits, setBenefits] = useState(product.keyBenefits.join("\n"));
  const [keywords, setKeywords] = useState(analysis.contentData.keywords.join(", "));
  const [hooks, setHooks] = useState(analysis.contentData.hooks.join("\n"));
  const [forbidden, setForbidden] = useState(analysis.contentData.forbiddenExpressions.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await api.products.update(product.id, {
        name,
        oneLiner,
        keyBenefits: toLines(benefits),
        contentData: {
          keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
          hooks: toLines(hooks),
          forbiddenExpressions: forbidden.split(",").map((s) => s.trim()).filter(Boolean),
        },
      });
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="제품 정보 수정"
      description="수정한 내용은 다음 콘텐츠 생성부터 바로 반영됩니다. (재분석 없음)"
      footer={
        <div className="flex items-center justify-end gap-3">
          {error && <span className="text-xs text-danger">{error}</span>}
          <Button variant="primary" loading={saving} onClick={save}>
            변경사항 저장
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="제품명" htmlFor="edit-name">
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField label="한 줄 설명" htmlFor="edit-oneliner">
          <Input id="edit-oneliner" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
        </FormField>
        <FormField label="주요 장점" htmlFor="edit-benefits" hint="한 줄에 하나씩">
          <Textarea id="edit-benefits" rows={3} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        </FormField>
        <FormField label="추천 Hook" htmlFor="edit-hooks" hint="한 줄에 하나씩">
          <Textarea id="edit-hooks" rows={3} value={hooks} onChange={(e) => setHooks(e.target.value)} />
        </FormField>
        <FormField label="추천 키워드" htmlFor="edit-keywords" hint="쉼표로 구분">
          <Input id="edit-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </FormField>
        <FormField label="사용하면 안 되는 표현" htmlFor="edit-forbidden" hint="쉼표로 구분">
          <Input id="edit-forbidden" value={forbidden} onChange={(e) => setForbidden(e.target.value)} />
        </FormField>
      </div>
    </SectionCard>
  );
}
