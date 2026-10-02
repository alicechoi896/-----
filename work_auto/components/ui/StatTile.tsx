import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cardClass } from "./SectionCard";

/** 숫자 요약 타일 (결과 수, 평균 점수 등). 큰 숫자 1개 + 라벨 + 보조 설명 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(cardClass, "px-4 py-3.5", className)}>
      <p className="text-xs font-medium text-fg-subtle">{label}</p>
      <p className="tabular mt-1.5 truncate text-[22px] leading-none font-bold text-fg">
        {value}
        {unit && <span className="ml-1 text-[13px] font-medium text-fg-subtle">{unit}</span>}
      </p>
      {hint && <p className="mt-1.5 truncate text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}
