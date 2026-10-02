import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-fg-muted ring-line",
  brand: "bg-brand-soft text-brand ring-brand-line",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
};

const dots: Record<BadgeTone, string> = {
  neutral: "bg-fg-subtle",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

/** 작은 라벨. 상태 표시는 StatusBadge 를 쓴다 */
export function Badge({
  tone = "neutral",
  dot,
  children,
  className,
}: {
  tone?: BadgeTone;
  /** 앞에 점 표시 (상태 표현용) */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

/** 키워드, 해시태그용 칩 */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border border-line bg-subtle px-2 text-xs text-fg-muted whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}
