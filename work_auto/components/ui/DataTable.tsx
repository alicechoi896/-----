"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";

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
  /** 정렬 기준 값. 있으면 헤더를 눌러 정렬할 수 있다 (처음 누르면 큰 값부터) */
  sortValue?: (row: T) => number | string;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

/**
 * 범용 데이터 표.
 * - 헤더: subtle 배경, 12px 회색
 * - 행: hover 시 subtle 배경, 구분선 1px
 * - 숫자 열은 numeric 으로 지정한다 (오른쪽 정렬 + tabular-nums)
 * - 열에 sortValue 를 주면 헤더 클릭으로 정렬한다 (내림차순 → 오름차순)
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  className,
  dense,
  defaultSort,
  selection,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** 행이 없을 때 표시 (EmptyState 권장) */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  dense?: boolean;
  /** 처음 정렬 상태 */
  defaultSort?: SortState;
  /** 체크 선택 (선택한 행의 rowKey 집합). 주면 맨 앞에 체크 열이 생긴다 */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
}) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const sortedRows = useMemo(() => {
    const col = sort && columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const sign = sort!.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sign;
    });
  }, [rows, columns, sort]);

  const cols: Column<T>[] = selection
    ? [
        {
          key: "__select",
          width: "44px",
          header: (
            <Checkbox
              label="전체 선택"
              checked={rows.length > 0 && rows.every((r) => selection.selected.has(rowKey(r)))}
              onChange={(on) => selection.onChange(on ? new Set(rows.map(rowKey)) : new Set())}
            />
          ),
          render: (r) => (
            // 행 클릭(상세 열기 등)과 겹치지 않게 막는다
            <span onClick={(e) => e.stopPropagation()} className="inline-flex">
              <Checkbox
                label="선택"
                checked={selection.selected.has(rowKey(r))}
                onChange={(on) => {
                  const next = new Set(selection.selected);
                  if (on) next.add(rowKey(r));
                  else next.delete(rowKey(r));
                  selection.onChange(next);
                }}
              />
            </span>
          ),
        },
        ...columns,
      ]
    : columns;

  function toggleSort(key: string) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle">
            {cols.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                className={cn(
                  "px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-fg-subtle first:pl-5 last:pr-5",
                  (col.numeric || col.align === "right") && "text-right",
                  col.align === "center" && "text-center",
                )}
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded hover:text-fg",
                      sort?.key === col.key && "text-fg",
                      (col.numeric || col.align === "right") && "flex-row-reverse",
                    )}
                  >
                    {col.header}
                    {sort?.key === col.key ? (
                      sort.dir === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
                    ) : (
                      <ArrowUpDown className="size-3 opacity-40" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="p-0">
                {empty ?? <p className="py-10 text-center text-sm text-fg-subtle">데이터가 없습니다.</p>}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line last:border-b-0 transition-colors hover:bg-subtle/70",
                  selection?.selected.has(rowKey(row)) && "bg-brand-soft/40",
                  onRowClick && "cursor-pointer",
                )}
              >
                {cols.map((col) => (
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
