import type { LucideIcon } from "lucide-react";
import type { AccentColor } from "@/lib/registry/types";
import { cn } from "@/lib/utils";

/** 채널 포인트 컬러 → 클래스. Tailwind 가 정적으로 찾을 수 있도록 전체 문자열로 적는다 */
const ACCENTS: Record<AccentColor, string> = {
  youtube: "bg-ch-youtube-soft text-ch-youtube",
  clip: "bg-ch-clip-soft text-ch-clip",
  blog: "bg-ch-blog-soft text-ch-blog",
  instagram: "bg-ch-instagram-soft text-ch-instagram",
  tools: "bg-ch-tools-soft text-ch-tools",
  neutral: "bg-ch-neutral-soft text-ch-neutral",
};

/**
 * 아이콘 칩: 포인트 컬러를 쓰는 유일한 곳.
 * UI 전체가 알록달록해지지 않도록 채널 색은 이 작은 칩 안에서만 쓴다.
 */
export function IconChip({
  icon: Icon,
  accent = "neutral",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  accent?: AccentColor;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = { sm: "size-7 rounded-md", md: "size-9 rounded-lg", lg: "size-11 rounded-[10px]" };
  const icons = { sm: "size-3.5", md: "size-[18px]", lg: "size-5" };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", sizes[size], ACCENTS[accent], className)}>
      <Icon className={icons[size]} strokeWidth={2} />
    </span>
  );
}
