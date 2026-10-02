import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 메인 영역 폭과 여백을 통일한다.
 * - default: 1200px (대부분의 화면)
 * - wide: 1440px (넓은 표, 2단 생성 화면)
 */
export function PageContainer({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: "default" | "wide";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-8 sm:px-8 lg:px-10 lg:py-10",
        width === "wide" ? "max-w-[1440px]" : "max-w-[1200px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
