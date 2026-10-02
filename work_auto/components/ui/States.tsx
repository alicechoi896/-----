import { CircleAlert, Inbox, LoaderCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

/**
 * 데이터 상태 3종 세트: Empty / Loading / Error
 * 모든 비동기 화면은 이 세 가지를 반드시 처리한다 (docs/DESIGN_SYSTEM.md "상태 표현").
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-14", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full border border-line bg-subtle">
        <Icon className="size-[18px] text-fg-subtle" />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-fg-subtle">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingState({
  label = "불러오는 중입니다…",
  className,
  variant = "spinner",
  rows = 4,
}: {
  label?: string;
  className?: string;
  /** spinner: 짧은 대기 / skeleton: 목록·표 자리 표시 */
  variant?: "spinner" | "skeleton";
  rows?: number;
}) {
  if (variant === "skeleton") {
    return (
      <div className={cn("space-y-3 p-1", className)} aria-busy aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-control bg-muted" style={{ opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("flex items-center justify-center gap-2 py-12 text-sm text-fg-subtle", className)} aria-busy>
      <LoaderCircle className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorState({
  title = "문제가 발생했습니다",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center rounded-card px-6 py-10 text-center", className)}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-danger-soft">
        <CircleAlert className="size-[18px] text-danger" />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {message && <p className="mt-1 max-w-md text-[13px] text-fg-subtle">{message}</p>}
      {onRetry && (
        <Button size="sm" className="mt-4" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

/** 페이지 상단 안내 박스 (정보, 경고) */
export function Notice({
  tone = "info",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: "info" | "warning" | "neutral";
  icon?: LucideIcon;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info/15 bg-info-soft text-info",
    warning: "border-warning/20 bg-warning-soft text-warning",
    neutral: "border-line bg-subtle text-fg-muted",
  };
  return (
    <div className={cn("flex gap-2.5 rounded-control border px-3.5 py-3 text-[13px] leading-relaxed", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" />}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5", "text-fg-muted")}>{children}</div>
      </div>
    </div>
  );
}
