"use client";

import { Search, X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { controlClass } from "./Input";

/** 돋보기 아이콘 + 지우기 버튼이 있는 검색 입력 */
export function SearchInput({
  value,
  onValueChange,
  onSubmit,
  className,
  placeholder = "검색",
  ...rest
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** Enter 입력 시 호출 */
  onSubmit?: () => void;
} & Omit<ComponentProps<"input">, "value" | "onChange" | "onSubmit">) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit?.();
        }}
        className={cn(controlClass, "h-9 pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden")}
        {...rest}
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onValueChange("")}
          className="absolute top-1/2 right-2 rounded p-0.5 text-fg-subtle -translate-y-1/2 hover:bg-muted hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
