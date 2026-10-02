import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** 셀 렌더러. 없으면 row[key] 를 문자열로 출력한다 */
  render?: (row: T, index: number) => ReactNode;
  /** CSS width (예: "120px", "30%") */
  width?: string;
  align?: "left" | "right" | "center";
  /** 숫자 열: 오른쪽 정렬 + 고정폭 숫자 */
  numeric?: boolean;
  className?: string;
}

/**
 * 범용 데이터 표.
 * - 헤더: subtle 배경, 12px 회색
 * - 행: hover 시 subtle 배경, 구분선 1px
 * - 숫자 열은 numeric 으로 지정한다 (오른쪽 정렬 + tabular-nums)
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  className,
  dense,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** 행이 없을 때 표시 (EmptyState 권장) */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                className={cn(
                  "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-fg-subtle first:pl-5 last:pr-5",
                  (col.numeric || col.align === "right") && "text-right",
                  col.align === "center" && "text-center",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <p className="py-10 text-center text-sm text-fg-subtle">데이터가 없습니다.</p>}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line last:border-b-0 transition-colors hover:bg-subtle/70",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 align-middle text-fg first:pl-5 last:pr-5",
                      dense ? "py-2" : "py-3",
                      col.numeric && "tabular text-right",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? "-")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
