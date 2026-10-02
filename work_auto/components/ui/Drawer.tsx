"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 오른쪽에서 열리는 상세 패널. 목록을 유지한 채 항목 하나를 자세히 볼 때 쓴다.
 * Esc 키나 바깥 영역 클릭으로 닫힌다.
 */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-fg/20" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute top-0 right-0 flex h-full w-full max-w-[560px] flex-col border-l border-line bg-canvas shadow-[0_0_40px_rgba(15,23,42,0.12)]",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 text-[15px] font-semibold text-fg">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line bg-subtle/60 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  );
}
