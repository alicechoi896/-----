"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** 체크박스 (권한표 등). label 은 화면에 안 보이더라도 접근성을 위해 필수 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "inline-flex size-[18px] items-center justify-center rounded-[5px] border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "border-brand bg-brand text-white" : "border-line-strong bg-canvas hover:border-fg-subtle",
        className,
      )}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </button>
  );
}
