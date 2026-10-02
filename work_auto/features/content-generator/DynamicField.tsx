"use client";

import Link from "next/link";
import type { FieldDef } from "@/lib/generators/types";
import { FormField } from "@/components/ui/FormField";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/Tabs";
import { cn } from "@/lib/utils";
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
  const { data, loading, error } = useRemoteOptions(field.source!);
  const options = data ?? [];
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
  else if (selected?.description) hint = <span className="line-clamp-2">{selected.description}</span>;

  return (
    <FormField label={field.label} htmlFor={`field-${field.name}`} required={field.required} optional={!field.required} hint={hint} className={className}>
      <Select
        id={`field-${field.name}`}
        value={value}
        disabled={loading}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        placeholder={loading ? "불러오는 중…" : (field.placeholder ?? "선택")}
        onChange={(e) => onChange(e.target.value)}
        className={cn(loading && "animate-pulse")}
      />
    </FormField>
  );
}
