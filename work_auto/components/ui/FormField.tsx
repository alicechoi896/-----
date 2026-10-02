import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 라벨 + 입력 + 도움말/오류를 묶는 폼 단위.
 * 모든 입력은 FormField 로 감싼다 (라벨 위치, 간격, 필수 표시를 통일하기 위해).
 */
export function FormField({
  label,
  htmlFor,
  required,
  optional,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** "선택" 표시 */
  optional?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-medium text-fg">
        {label}
        {required && <span className="text-danger" aria-hidden>*</span>}
        {optional && <span className="text-xs font-normal text-fg-subtle">(선택)</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
