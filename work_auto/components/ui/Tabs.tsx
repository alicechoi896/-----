"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
}

/**
 * 밑줄형 탭 (페이지 안의 큰 영역 전환: AI 학습 관리, 입력 방식 등).
 * 제어 컴포넌트다. 상태는 부모가 가진다.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none]", className)}>
      {items.map((item) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40",
              active ? "border-brand text-fg" : "border-transparent text-fg-subtle hover:text-fg-muted",
            )}
          >
            {Icon && <Icon className="size-4" />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[11px] leading-[18px]",
                  active ? "bg-brand-soft text-brand" : "bg-muted text-fg-subtle",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 세그먼트 컨트롤 (작은 옵션 전환: 기간 7/14/21일, 카드/목록 보기).
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: { value: V; label: string; icon?: LucideIcon }[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-control border border-line bg-subtle p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-[6px] font-medium whitespace-nowrap transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              active ? "bg-canvas text-fg shadow-card ring-1 ring-line" : "text-fg-subtle hover:text-fg-muted",
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {Icon && size === "sm" ? null : o.label}
          </button>
        );
      })}
    </div>
  );
}
