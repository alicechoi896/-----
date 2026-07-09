import type { Filter } from '../types'

interface TodoFilterProps {
  filter: Filter
  onFilterChange: (filter: Filter) => void
  remainingCount: number
  hasCompleted: boolean
  onClearCompleted: () => void
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '진행 중' },
  { value: 'completed', label: '완료' },
]

export function TodoFilter({
  filter,
  onFilterChange,
  remainingCount,
  hasCompleted,
  onClearCompleted,
}: TodoFilterProps) {
  return (
    <div className="todo-filter">
      <span className="remaining-count">{remainingCount}개 남음</span>
      <div className="filter-buttons">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={value === filter ? 'active' : ''}
            onClick={() => onFilterChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="clear-btn" onClick={onClearCompleted} disabled={!hasCompleted}>
        완료 항목 삭제
      </button>
    </div>
  )
}
