"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * [만들기] → 어떤 콘텐츠로 만들지 고르는 작은 메뉴 (v0.9.43).
 * 트렌드 찾기에서 제품 홍보 / 정보성 중 하나를 골라 생성 화면으로 넘어간다.
 */
export function MakeMenu({
  label = "만들기",
  items,
  iconOnly,
  className,
}: {
  label?: string;
  items: { label: string; href: string }[];
  iconOnly?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span ref={box} className={cn("relative inline-flex", className)} data-make-menu>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-0.5 rounded-control text-xs font-medium text-fg-subtle hover:text-brand",
          iconOnly ? "size-8 justify-center hover:bg-muted" : "px-1 py-1",
        )}
      >
        {iconOnly ? (
          <ArrowUpRight className="size-4" />
        ) : (
          <>
            {label}
            <ChevronDown className="size-3.5" />
          </>
        )}
      </button>
      {open && (
        <span role="menu" className="absolute top-full right-0 z-30 mt-1 flex min-w-40 flex-col rounded-control border border-line bg-canvas py-1 shadow-card">
          {items.map((it) => (
            <Link
              key={it.href}
              role="menuitem"
              href={it.href}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] whitespace-nowrap text-fg hover:bg-subtle hover:text-brand"
            >
              {it.label}
              <ArrowUpRight className="size-3.5 text-fg-subtle" />
            </Link>
          ))}
        </span>
      )}
    </span>
  );
}
