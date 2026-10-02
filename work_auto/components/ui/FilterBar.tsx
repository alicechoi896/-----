import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 목록/표 위의 필터 영역.
 * 왼쪽: 필터 컨트롤들 (FilterBar.Item 으로 라벨 부착 가능), 오른쪽: 실행/보기 전환 버튼.
 */
export function FilterBar({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3 rounded-card border border-line bg-subtle/70 px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-end gap-3">{children}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 필터 하나 (작은 라벨 + 컨트롤) */
export function FilterItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-[11.5px] font-medium text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}
