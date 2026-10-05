"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { FieldDef } from "@/lib/generators/types";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/Combobox";
import { useRemoteOptions } from "./useRemoteOptions";

export type FormValues = Record<string, string>;

/**
 * FieldDef(Generator Config) 하나를 알맞은 입력 컴포넌트로 렌더링한다.
 * 새 필드 타입이 필요하면 FieldType 에 추가하고 여기에 분기를 하나 추가한다.
 */
export function DynamicField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const span = field.span === 1 ? "col-span-2 sm:col-span-1" : "col-span-2";

  if (field.type === "remote-select") {
    return <RemoteSelectField field={field} value={value} onChange={onChange} className={span} />;
  }

  return (
    <FormField
      label={field.label}
      htmlFor={id}
      required={field.required}
      hint={field.type === "tags" ? (field.hint ?? "쉼표(,)로 구분해 여러 개를 입력할 수 있습니다.") : field.hint}
      className={span}
    >
      {field.type === "text" || field.type === "tags" ? (
        <Input id={id} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "textarea" ? (
        <Textarea id={id} rows={3} value={value} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <Select
          id={id}
          value={value}
          options={field.options ?? []}
          placeholder={field.placeholder ?? "선택"}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "multi" ? (
        <MultiChips options={field.options ?? []} value={value} onChange={onChange} />
      ) : field.type === "segmented" ? (
        <SegmentedControl
          className="flex-wrap"
          options={field.options ?? []}
          value={value}
          onChange={onChange}
        />
      ) : null}
    </FormField>
  );
}

/** 여러 개 고르기 (값은 쉼표로 이은 문자열, 최소 1개) */
function MultiChips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const picked = value.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1.5" data-multi-chips>
      {options.map((o) => {
        const on = picked.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = on ? picked.filter((p) => p !== o.value) : [...picked, o.value];
              if (next.length) onChange(next.join(","));
            }}
            className={cn(
              "h-8 rounded-full px-3 text-[13px] font-medium ring-1 transition-colors ring-inset",
              on ? "bg-brand-soft text-brand ring-brand-line" : "text-fg-muted ring-line hover:bg-subtle",
            )}
          >
            {on && "✓ "}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RemoteSelectField({
  field,
  value,
  onChange,
  className,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  // 참고 트렌드처럼 '넘어온 값만' 보이는 칸: 값이 없으면 숨기고, 있으면 목록을 부르지 않고 넘어온 항목만 보여 준다
  if (field.onlyWhenSet) {
    if (!value) return null;
    return (
      <FormField label={field.label} className={className}>
        <div className="flex items-center justify-between gap-2 rounded-control border border-brand-line bg-brand-soft/50 px-3 py-2 text-[13px] text-fg" data-carried-trend>
          <span className="truncate">트렌드 찾기에서 고른 항목을 참고합니다</span>
          <button type="button" onClick={() => onChange("")} className="shrink-0 text-xs text-fg-subtle hover:text-danger">
            빼기
          </button>
        </div>
      </FormField>
    );
  }
  return <RemoteSelectInner field={field} value={value} onChange={onChange} className={className} />;
}

function RemoteSelectInner({
  field,
  value,
  onChange,
  className,
}: {
  field: FieldDef;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { data, loading, error } = useRemoteOptions(field.source!, field.sourceParam);
  const loaded = data ?? [];
  // 스타일: 기본 스타일(★)을 처음에 골라 둔다 (무엇이 적용되는지 보이게, v0.9.41)
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || field.source !== "styles" || value || !data?.length) return;
    autoPicked.current = true;
    const def = data.find((o) => o.label.startsWith("★ "));
    if (def) onChange(def.value);
  }, [data, field.source, value, onChange]);
  // 고를 것이 1개 이하면 묻지 않는다 (자동 적용)
  if (field.hideIfSingle && !loading && loaded.length <= 1 && !value) return null;
  // 다른 화면에서 넘어온 값(예: 트렌드 화면의 영상)이 목록에 없어도 선택된 상태로 보여준다
  const options =
    value && !loading && !loaded.some((o) => o.value === value)
      ? [{ value, label: field.source === "youtube-trends" ? "트렌드 화면에서 고른 영상" : "이전 화면에서 고른 항목", description: "생성할 때 이 항목 정보를 함께 사용합니다." }, ...loaded]
      : loaded;
  const selected = options.find((o) => o.value === value);
  const isProduct = field.source === "products";

  let hint: React.ReactNode = field.hint;
  if (error) hint = <span className="text-danger">목록을 불러오지 못했습니다: {error}</span>;
  else if (!loading && options.length === 0 && isProduct)
    hint = (
      <>
        저장된 제품이 없습니다.{" "}
        <Link href="/tools/product-learning" className="font-medium text-brand hover:underline">
          제품 상세페이지 학습
        </Link>
        에서 먼저 제품을 등록하세요.
      </>
    );
  else if (!loading && loaded.length === 0 && field.source === "styles")
    hint = (
      <>
        이 채널에 쓸 스타일이 없습니다.{" "}
        <Link href="/ai-learning?tab=styles" className="font-medium text-brand hover:underline">
          나의 스타일
        </Link>
        에서 만들 수 있습니다.
      </>
    );
  else if (!loading && loaded.length === 0 && field.source === "script-formats")
    hint = (
      <>
        대본 포맷이 없습니다.{" "}
        <Link href="/ai-learning?tab=formats" className="font-medium text-brand hover:underline">
          대본 포맷
        </Link>
        에서 참고 대본으로 만들 수 있습니다.
      </>
    );
  else if (selected?.description) hint = <span className="line-clamp-2">{selected.description}</span>;

  return (
    <FormField label={field.label} htmlFor={`field-${field.name}`} required={field.required} optional={!field.required} hint={hint} className={className}>
      {/* 검색할 수 있는 선택 상자: 제품·트렌드가 많아도 글자를 입력해 바로 찾는다 */}
      <Combobox
        id={`field-${field.name}`}
        value={value}
        disabled={loading}
        options={options}
        placeholder={loading ? "불러오는 중…" : (field.placeholder ?? "선택")}
        searchPlaceholder={field.source === "products" ? "제품 이름·브랜드로 검색" : "검색"}
        clearable={!field.required}
        onChange={onChange}
        className={cn(loading && "animate-pulse")}
      />
    </FormField>
  );
}
