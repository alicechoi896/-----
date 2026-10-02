import Link from "next/link";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors " +
  "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const variants: Record<ButtonVariant, string> = {
  /** 화면의 주요 행동 1개 (생성하기, 분석하기, 저장) */
  primary: "bg-brand text-white shadow-card hover:bg-brand-hover",
  /** 보조 행동 (테스트, 수정, 취소) */
  secondary: "border border-line-strong bg-canvas text-fg hover:bg-subtle",
  /** 아이콘 버튼, 표 안의 가벼운 행동 */
  ghost: "text-fg-muted hover:bg-muted hover:text-fg",
  /** 선택 상태와 비슷한 부드러운 강조 */
  subtle: "bg-brand-soft text-brand hover:bg-brand-line/60",
  /** 삭제, 연결 해제 */
  danger: "border border-line-strong bg-canvas text-danger hover:bg-danger-soft hover:border-danger/30",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps & Omit<ComponentProps<"button">, keyof CommonProps>;
type LinkButtonProps = CommonProps & { href: string } & Omit<ComponentProps<typeof Link>, keyof CommonProps | "href">;

function Inner({ icon: Icon, iconRight: IconRight, loading, children, size }: CommonProps) {
  const iconClass = size === "sm" ? "size-3.5" : "size-4";
  return (
    <>
      {loading ? <LoaderCircle className={cn(iconClass, "animate-spin")} /> : Icon ? <Icon className={iconClass} /> : null}
      {children}
      {IconRight && !loading ? <IconRight className={iconClass} /> : null}
    </>
  );
}

/** 공통 버튼. 디자인 규칙은 docs/DESIGN_SYSTEM.md "Button" 참고 */
export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      <Inner icon={icon} iconRight={iconRight} loading={loading} size={size}>
        {children}
      </Inner>
    </button>
  );
}

/** 페이지 이동용 버튼 (Link 를 버튼 모양으로) */
export function LinkButton({ variant = "secondary", size = "md", icon, iconRight, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...rest}>
      <Inner icon={icon} iconRight={iconRight} size={size}>
        {children}
      </Inner>
    </Link>
  );
}

/** 아이콘만 있는 정사각 버튼. 접근성을 위해 label 이 필수다 */
export function IconButton({
  icon: Icon,
  label,
  className,
  size = "md",
  ...rest
}: { icon: LucideIcon; label: string; size?: "sm" | "md" } & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-control text-fg-subtle transition-colors hover:bg-muted hover:text-fg disabled:opacity-50",
        size === "sm" ? "size-7" : "size-8",
        className,
      )}
      {...rest}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </button>
  );
}
