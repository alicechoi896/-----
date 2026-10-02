"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 클립보드 복사 버튼. 복사 후 1.5초간 "복사됨" 상태를 보여준다.
 * value 가 배열이면 줄바꿈으로 합쳐서 복사한다.
 */
export function CopyButton({
  value,
  label = "복사",
  className,
  iconOnly,
}: {
  value: string | string[];
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function handleCopy() {
    const text = Array.isArray(value) ? value.join("\n") : value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // 클립보드 권한이 없으면 조용히 실패한다 (보안 컨텍스트가 아닌 경우)
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "복사됨" : label}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors",
        copied ? "text-success" : "text-fg-subtle hover:bg-muted hover:text-fg",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {!iconOnly && (copied ? "복사됨" : label)}
    </button>
  );
}
