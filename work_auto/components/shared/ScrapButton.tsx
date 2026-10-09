"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Check, Plus } from "lucide-react";
import { api, type ScrapItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * [스크랩] (v0.9.54) — 트렌드를 분류(폴더)를 골라 저장한다. YouTube·NAVER·Instagram 트렌드 찾기 공용. docs/SCRAPS.md
 * 분류 목록은 처음 열 때 한 번만 불러온다. 새 분류는 이름을 적으면 만들어진다. 외부 API 호출 없음.
 */
let foldersCache: string[] | null = null;

export function ScrapButton({ item, className }: { item: Omit<ScrapItem, "folder">; className?: string }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<string[] | null>(foldersCache);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function show() {
    setOpen((v) => !v);
    setError(null);
    if (folders) return;
    try {
      const r = await api.scraps.list();
      foldersCache = r.folders.map((f) => f.name);
      setFolders(foldersCache);
    } catch {
      setFolders([]);
    }
  }

  async function save(folder: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.scraps.add({ ...item, folder });
      if (folder && foldersCache && !foldersCache.includes(folder)) foldersCache = [...foldersCache, folder].sort((a, b) => a.localeCompare(b, "ko"));
      setFolders(foldersCache);
      setSaved(folder || "분류 없음");
      setOpen(false);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "스크랩하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span ref={box} className={cn("relative inline-flex", className)} data-scrap>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void show();
        }}
        title={saved ? `스크랩함 · ${saved}` : "스크랩 (분류 골라 저장)"}
        aria-label="스크랩"
        className={cn("inline-flex size-8 items-center justify-center rounded-control hover:bg-muted", saved ? "text-brand" : "text-fg-subtle hover:text-brand")}
      >
        {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
      </button>
      {open && (
        <span role="dialog" onClick={(e) => e.stopPropagation()} className="absolute top-full right-0 z-30 mt-1 w-60 rounded-control border border-line bg-canvas p-2 text-[13px] shadow-card">
          <span className="block px-1 pb-1 text-xs font-semibold text-fg-muted">어느 분류에 스크랩할까요?</span>
          <span className="block max-h-48 overflow-y-auto">
            <button type="button" disabled={busy} onClick={() => void save("")} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-subtle">
              분류 없음
            </button>
            {(folders ?? []).map((f) => (
              <button key={f} type="button" disabled={busy} onClick={() => void save(f)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-subtle">
                {f}
                {saved === f && <Check className="size-3.5 text-brand" />}
              </button>
            ))}
            {folders === null && <span className="block px-2 py-1.5 text-xs text-fg-subtle">분류를 불러오는 중…</span>}
          </span>
          <form
            className="mt-1 flex gap-1 border-t border-line pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void save(name.trim());
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="새 분류 이름" className="h-8 min-w-0 flex-1 rounded border border-line px-2 text-[13px]" />
            <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-8 items-center gap-0.5 rounded bg-brand px-2 text-xs font-medium text-white disabled:opacity-50">
              <Plus className="size-3.5" />
              만들기
            </button>
          </form>
          {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
          <Link href="/scraps" className="mt-1 block px-1 text-xs text-fg-subtle hover:text-brand">
            스크랩 모아 보기 →
          </Link>
        </span>
      )}
    </span>
  );
}
