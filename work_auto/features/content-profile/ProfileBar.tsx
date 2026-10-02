"use client";

import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import type { ContentProfileState } from "./useContentProfile";
import { cn } from "@/lib/utils";

/**
 * "현재 분석 기준" 정보 바 (YouTube / NAVER 클립 / NAVER 블로그 트렌드 공용).
 * 화면을 크게 차지하지 않도록 한 줄 요약만 보여준다. 프로필이 2개 이상일 때만 전환 선택이 나온다.
 */
export function ProfileBar({ state, note, className }: { state: ContentProfileState; note?: string; className?: string }) {
  const { ready, profiles, selected, select, applied, setApplied } = state;
  if (!ready) return <div className={cn("h-[50px] animate-pulse rounded-card border border-line bg-subtle/60", className)} />;

  if (!selected) {
    return (
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-dashed border-line-strong bg-subtle/50 px-4 py-2.5 text-[13px]", className)}>
        <Compass className="size-4 text-fg-subtle" />
        <span className="text-fg-muted">콘텐츠 프로필이 없습니다. 다루는 분야를 한 번 저장해 두면 매번 카테고리·키워드를 넣지 않아도 됩니다.</span>
        <Link href="/ai-learning?tab=profiles" className="ml-auto inline-flex items-center gap-0.5 font-medium text-brand hover:underline">
          프로필 만들기 <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  const scope = [selected.mainCategory, ...selected.subCategories].join(" · ");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card border border-brand-line/70 bg-brand-soft/30 px-4 py-2.5 text-[13px]",
        !applied && "border-line bg-subtle/50",
        className,
      )}
    >
      <span className="text-[11.5px] font-medium text-fg-subtle">현재 분석 기준</span>
      {profiles.length > 1 ? (
        <select
          aria-label="콘텐츠 프로필 전환"
          value={selected.id}
          onChange={(e) => select(e.target.value)}
          className="h-7 rounded-control border border-line-strong bg-canvas px-2 text-[13px] font-semibold text-fg focus:border-brand focus:outline-none"
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " (기본)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <span className="inline-flex h-6 items-center rounded-md bg-canvas px-2 font-semibold text-fg ring-1 ring-brand-line">{selected.name}</span>
      )}
      <span className={cn("text-fg-muted", !applied && "line-through opacity-60")}>{scope}</span>
      {selected.seedKeywords.length > 0 && (
        <span className={cn("truncate text-fg-subtle", !applied && "line-through opacity-60")}>
          {selected.seedKeywords.slice(0, 6).map((k) => `#${k}`).join(" ")}
        </span>
      )}
      {note && applied && <span className="text-xs text-fg-subtle">{note}</span>}
      <span className="ml-auto flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
          <input type="checkbox" checked={applied} onChange={(e) => setApplied(e.target.checked)} className="accent-[var(--color-brand)]" />
          프로필 적용
        </label>
        <Link href="/ai-learning?tab=profiles" className="inline-flex items-center gap-0.5 text-xs font-medium text-brand hover:underline">
          프로필 수정 <ArrowRight className="size-3.5" />
        </Link>
      </span>
    </div>
  );
}
