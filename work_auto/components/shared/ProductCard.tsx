"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Eye, Pencil, Sparkles, Trash2 } from "lucide-react";
import type { Product } from "@/lib/types";
import { Button, IconButton } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/SectionCard";
import { formatDate, formatRelative } from "@/lib/utils";
import { ProductThumb } from "./ProductThumb";

/** "콘텐츠 만들기" 메뉴: 제품이 미리 선택된 생성 화면으로 이동 */
export const PRODUCT_CONTENT_TARGETS = [
  { label: "YouTube 제품 홍보 영상", href: "/youtube/product-video" },
  { label: "NAVER 클립 제품 홍보 클립", href: "/naver-clip/product-content" },
  { label: "NAVER 블로그 제품 글", href: "/naver-blog/product-writing" },
];

export function CreateContentMenu({ productId, size = "sm" }: { productId: string; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button size={size} variant="subtle" icon={Sparkles} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        콘텐츠 만들기
      </Button>
      {open && (
        <div className="absolute right-0 bottom-full z-20 mb-1.5 w-56 rounded-card border border-line bg-canvas p-1 shadow-pop">
          {PRODUCT_CONTENT_TARGETS.map((t) => (
            <Link
              key={t.href}
              href={`${t.href}?productId=${productId}`}
              className="block rounded-md px-3 py-2 text-[13px] text-fg-muted hover:bg-subtle hover:text-fg"
            >
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 제품 라이브러리 카드.
 * 표시: 대표 이미지, 제품명, 브랜드, 카테고리, 주요 장점, 저장일, 최근 사용일
 * 버튼: 상세보기, 수정, 콘텐츠 만들기, 삭제
 */
export function ProductCard({ product, onDelete }: { product: Product; onDelete: (product: Product) => void }) {
  const detailHref = `/tools/product-library/${product.id}`;
  return (
    <article className={`${cardClass} flex flex-col overflow-hidden`}>
      <Link href={detailHref} className="block">
        <ProductThumb name={product.name} imageUrl={product.imageUrl} className="h-32 w-full border-b border-line" />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs text-fg-subtle">
          {product.brand} · {product.category}
        </p>
        <Link href={detailHref} className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold text-fg hover:text-brand">
          {product.name}
        </Link>
        <ul className="mt-3 flex-1 space-y-1">
          {product.keyBenefits.slice(0, 3).map((b) => (
            <li key={b} className="line-clamp-1 text-[13px] text-fg-muted">
              · {b}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1">
          {product.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
        <dl className="tabular mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
          <div>
            <dt className="text-fg-subtle">저장일</dt>
            <dd className="mt-0.5 text-fg-muted">{formatDate(product.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">최근 사용</dt>
            <dd className="mt-0.5 text-fg-muted">{product.lastUsedAt ? formatRelative(product.lastUsedAt) : "사용 전"}</dd>
          </div>
        </dl>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-line bg-subtle/60 px-3 py-2.5">
        <div className="flex items-center gap-0.5">
          <Link href={detailHref} aria-label="상세보기" title="상세보기" className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-fg">
            <Eye className="size-4" />
          </Link>
          <Link href={`${detailHref}?mode=edit`} aria-label="수정" title="수정" className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-fg">
            <Pencil className="size-4" />
          </Link>
          <IconButton icon={Trash2} label="삭제" onClick={() => onDelete(product)} className="hover:text-danger" />
        </div>
        <CreateContentMenu productId={product.id} />
      </footer>
    </article>
  );
}
