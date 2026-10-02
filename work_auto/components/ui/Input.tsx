import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** 입력창 공통 스타일 (Input, Textarea, Select 가 공유한다) */
export const controlClass =
  "w-full rounded-control border border-line-strong bg-canvas px-3 text-sm text-fg placeholder:text-fg-subtle " +
  "transition-colors hover:border-fg-subtle/60 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-subtle aria-invalid:border-danger";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-9", className)} {...rest} />;
}

export function Textarea({ className, rows = 4, ...rest }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlClass, "resize-y py-2 leading-relaxed", className)} {...rest} />;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  options,
  placeholder,
  className,
  ...rest
}: { options: SelectOption[]; placeholder?: string } & Omit<ComponentProps<"select">, "children">) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(controlClass, "h-9 appearance-none pr-8")} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  );
}
