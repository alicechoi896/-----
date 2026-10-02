"use client";

import { useState } from "react";
import { Bookmark, RotateCcw, Save, Search, Star, Trash2 } from "lucide-react";
import { YOUTUBE_CATEGORIES, YOUTUBE_COUNTRIES, dateRange } from "@/lib/domain/youtube";
import type { SavedFilter, YouTubeTrendQuery } from "@/lib/types";
import { Badge, Button, Checkbox, Input, SegmentedControl, Select, cardClass } from "@/components/ui";
import { cn, formatCompact } from "@/lib/utils";

export type TrendDraft = Omit<YouTubeTrendQuery, "pageToken" | "scope">;

const FORMATS = [
  { value: "all", label: "전체" },
  { value: "shorts", label: "Shorts" },
  { value: "long", label: "롱폼" },
] as const;

const QUICK_RANGES = [
  { days: 1, label: "24시간" },
  { days: 3, label: "3일" },
  { days: 7, label: "7일" },
  { days: 14, label: "14일" },
  { days: 21, label: "21일" },
  { days: 30, label: "30일" },
  { days: 90, label: "3개월" },
];

/**
 * 검색 조건 영역: 국가·카테고리·키워드·유형 / 게시일 / 구독자·조회수·댓글 범위 / 저장한 조건.
 * 조건을 바꾸고 [검색] 을 눌러야 조회한다 (YouTube API 할당량 절약).
 */
export function TrendFilterPanel({
  draft,
  resetQuery,
  onChange,
  onSearch,
  filters,
  activeFilterId,
  onPickFilter,
  onSaveFilter,
  onMakeDefault,
  onDeleteFilter,
  searching,
}: {
  draft: TrendDraft;
  /** [초기화] 를 누르면 돌아갈 조건 (콘텐츠 프로필 기본값 포함) */
  resetQuery: () => TrendDraft;
  onChange: (next: TrendDraft) => void;
  onSearch: () => void;
  filters: SavedFilter[];
  activeFilterId: string;
  onPickFilter: (id: string) => void;
  onSaveFilter: (name: string, isDefault: boolean) => Promise<void>;
  onMakeDefault: (id: string) => void;
  onDeleteFilter: (id: string) => void;
  searching: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const set = (patch: Partial<TrendDraft>) => onChange({ ...draft, ...patch });
  const active = filters.find((f) => f.id === activeFilterId);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSaveFilter(name.trim(), asDefault);
      setSaveOpen(false);
      setName("");
      setAsDefault(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={cn(cardClass, "overflow-hidden")}>
      <form
        className="space-y-4 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <Field label="국가">
            <Select
              value={draft.country}
              options={YOUTUBE_COUNTRIES.map((c) => ({ value: c.code, label: c.label }))}
              onChange={(e) => set({ country: e.target.value })}
            />
          </Field>
          <Field label="카테고리">
            <Select
              value={draft.categoryId ?? ""}
              options={YOUTUBE_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
              placeholder="전체 카테고리"
              onChange={(e) => set({ categoryId: e.target.value || undefined })}
            />
          </Field>
          <Field label="검색 키워드">
            <Input
              value={draft.keyword ?? ""}
              placeholder="이번에 좁혀 볼 키워드 (비우면 프로필·카테고리 전체)"
              onChange={(e) => set({ keyword: e.target.value || undefined })}
            />
          </Field>
          <Field label="영상 유형">
            <SegmentedControl options={[...FORMATS]} value={draft.format ?? "all"} onChange={(v) => set({ format: v })} />
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <Field label="게시일">
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-[150px]" value={draft.publishedFrom} max={draft.publishedTo} onChange={(e) => e.target.value && set({ publishedFrom: e.target.value, recentDays: undefined })} />
              <span className="text-fg-subtle">~</span>
              <Input type="date" className="w-[150px]" value={draft.publishedTo ?? ""} min={draft.publishedFrom} onChange={(e) => set({ publishedTo: e.target.value || undefined, recentDays: undefined })} />
              <span className="text-xs text-fg-subtle">최근</span>
              <div className="flex flex-wrap gap-1">
                {QUICK_RANGES.map((r) => (
                  <button
                    key={r.days}
                    type="button"
                    onClick={() => set({ ...dateRange(r.days), recentDays: r.days })}
                    aria-pressed={draft.recentDays === r.days}
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-xs transition-colors",
                      draft.recentDays === r.days
                        ? "border-brand bg-brand text-white"
                        : "border-line text-fg-muted hover:border-brand-line hover:bg-brand-soft hover:text-brand",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RangeField
            label="구독자 수"
            min={draft.minSubscribers}
            max={draft.maxSubscribers}
            maxInclusive
            onChange={(min, max) => set({ minSubscribers: min, maxSubscribers: max })}
          />
          <RangeField label="조회수" min={draft.minViews} max={draft.maxViews} onChange={(min, max) => set({ minViews: min, maxViews: max })} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Bookmark className="size-4 text-fg-subtle" />
            <Select
              className="w-56"
              value={activeFilterId}
              options={filters.map((f) => ({ value: f.id, label: f.isDefault ? `★ ${f.name} (기본)` : f.name }))}
              placeholder={filters.length ? "저장한 조건 불러오기" : "저장한 조건 없음"}
              onChange={(e) => onPickFilter(e.target.value)}
            />
            {active && !active.isDefault && (
              <Button size="sm" variant="ghost" icon={Star} onClick={() => onMakeDefault(active.id)}>
                기본으로
              </Button>
            )}
            {active && (
              <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onDeleteFilter(active.id)}>
                삭제
              </Button>
            )}
            <Button size="sm" variant="subtle" icon={Save} onClick={() => setSaveOpen((v) => !v)}>
              현재 조건 저장
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              icon={RotateCcw}
              onClick={() => {
                onChange(resetQuery());
                onPickFilter("");
              }}
            >
              초기화
            </Button>
            <Button type="submit" variant="primary" icon={Search} loading={searching}>
              검색
            </Button>
          </div>
        </div>

        {saveOpen && (
          <div className="flex flex-wrap items-center gap-3 rounded-control border border-brand-line bg-brand-soft/40 px-3 py-2.5">
            <Input
              className="w-60"
              value={name}
              maxLength={40}
              autoFocus
              placeholder="조건 이름 (예: 한국 생활 Shorts)"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            <label className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Checkbox checked={asDefault} onChange={setAsDefault} label="기본 조건으로 사용" />
              기본 조건으로 사용
              <Badge tone="neutral">화면을 열 때 자동 적용 · 생성 화면 참고 트렌드 기준</Badge>
            </label>
            <Button size="sm" variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void save()}>
              저장
            </Button>
            <span className="text-xs text-fg-subtle">같은 이름이 있으면 덮어씁니다.</span>
          </div>
        )}
      </form>
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11.5px] font-medium text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  maxInclusive,
  onChange,
}: {
  label: string;
  min?: number;
  max?: number;
  /** 구독자는 "이하", 조회수는 "미만" */
  maxInclusive?: boolean;
  onChange: (min?: number, max?: number) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <NumberInput value={min} placeholder="0" suffix="이상" onChange={(v) => onChange(v, max)} />
        <span className="text-fg-subtle">~</span>
        <NumberInput value={max} placeholder="제한 없음" suffix={maxInclusive ? "이하" : "미만"} onChange={(v) => onChange(min, v)} />
      </div>
    </Field>
  );
}

/** 숫자 입력 (쉼표 허용). 입력 아래에 1.2만 같은 읽기 쉬운 값을 함께 보여준다 */
function NumberInput({
  value,
  placeholder,
  suffix,
  onChange,
}: {
  value?: number;
  placeholder?: string;
  suffix: string;
  onChange: (v?: number) => void;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Input
        inputMode="numeric"
        className="pr-14"
        value={value == null ? "" : value.toLocaleString("ko-KR")}
        placeholder={placeholder}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits ? Math.min(Number(digits), 1e12) : undefined);
        }}
        title={value != null && value >= 10_000 ? formatCompact(value) : undefined}
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-subtle">{suffix}</span>
    </div>
  );
}
