"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./Input";

export interface ComboOption {
  value: string;
  label: string;
  /** 검색에도 쓰이는 보조 설명 (예: 브랜드, 키워드) */
  description?: string;
}

/** 공백·대소문자 무시 비교 (한글 검색어 "무선 청소기" ↔ "무선청소기") */
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/**
 * 검색할 수 있는 선택 상자.
 * 목록이 길어도 글자를 입력하면 바로 좁혀진다. 키보드: ↑↓ 이동, Enter 선택, Esc 닫기.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder = "선택",
  searchPlaceholder = "검색",
  emptyText = "검색 결과가 없습니다",
  disabled,
  clearable = true,
  className,
}: {
  id?: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** 선택 해제(×) 버튼 */
  clearable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 목록은 화면 맨 위(body)에 띄운다: 표처럼 스크롤 영역 안에 있어도 잘리지 않게
  const [pos, setPos] = useState<CSSProperties>({ position: "fixed", visibility: "hidden" }); // 위치를 잡기 전에는 숨긴다
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return options;
    return options.filter((o) => norm(`${o.label} ${o.description ?? ""}`).includes(q));
  }, [options, query]);

  // 바깥을 누르면 닫고, 스크롤·크기 변경 때 위치를 다시 잡는다
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 260);
      const below = window.innerHeight - r.bottom;
      const up = below < 320 && r.top > below;
      setPos({
        position: "fixed",
        left: Math.min(r.left, window.innerWidth - width - 8),
        width,
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      });
    };
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
    // 목록 위치를 잡기 전에 포커스가 가면 페이지가 아래로 튄다 → 스크롤 없이 포커스
    setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 0);
  }

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        className={cn(controlClass, "flex h-9 items-center gap-2 pr-14 text-left", !selected && "text-fg-subtle")}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
      </button>
      {clearable && selected && !disabled && (
        <button
          type="button"
          aria-label="선택 해제"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:bg-muted hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-fg-subtle" />

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={pos}
            className="z-[60] overflow-hidden rounded-control border border-line bg-canvas shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
          >
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <input
                ref={inputRef}
                value={query}
                placeholder={searchPlaceholder}
                role="combobox"
                aria-controls={listId}
                aria-expanded
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (filtered[active]) choose(filtered[active].value);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                className="h-9 w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <span className="tabular shrink-0 text-[11px] text-fg-subtle">{filtered.length}개</span>
            </div>
            <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-3 py-3 text-center text-[13px] text-fg-subtle">{emptyText}</li>}
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(o.value);
                  }}
                  className={cn("flex cursor-pointer items-start gap-2 px-3 py-2", i === active && "bg-subtle")}
                >
                  <Check className={cn("mt-0.5 size-4 shrink-0", o.value === value ? "text-brand" : "invisible")} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{o.label}</span>
                    {o.description && <span className="block truncate text-xs text-fg-subtle">{o.description}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
