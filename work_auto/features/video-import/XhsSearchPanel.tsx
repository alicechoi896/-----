"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Heart, ListPlus, MessageCircle, Search, Sparkles, Star } from "lucide-react";
import type { ReferenceVideo, XhsNote, XhsPeriodOption, XhsSearchCursor, XhsSortOption } from "@/lib/types";
import { ApiError, api } from "@/lib/api-client";
import { Button, Combobox, Drawer, FormField, Input, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

const SORTS: { value: XhsSortOption; label: string }[] = [
  { value: "general", label: "종합" },
  { value: "latest", label: "최신순" },
  { value: "likes", label: "좋아요순" },
  { value: "comments", label: "댓글순" },
  { value: "collects", label: "저장순" },
];
const PERIODS: { value: XhsPeriodOption; label: string }[] = [
  { value: "7", label: "최근 7일" },
  { value: "21", label: "최근 21일" },
  { value: "30", label: "최근 30일" },
  { value: "all", label: "전체" },
];

const num = (n: number | null) => (n == null ? null : n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : n.toLocaleString("ko-KR"));
const dur = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }) : null);

type ImportResult = { url: string; ok: boolean; video?: ReferenceVideo; error?: string };

/**
 * 영상 URL 가져오기 › [샤오홍슈 검색] 탭 (docs/XIAOHONGSHU_SEARCH.md)
 * 검색 → 여러 개 체크 → [선택한 영상 가져오기] = URL 가져오기와 같은 api.videos.importMany() (원본 URL + 제목)
 * 검색 결과는 이 화면에만 있고 저장하지 않는다. TikHub 가 안 돼도 URL 가져오기 탭은 그대로 쓴다.
 */
export function XhsSearchPanel({
  productOptions,
  productsLoading,
  maxBatch,
  onImported,
}: {
  productOptions: { value: string; label: string; description?: string }[];
  productsLoading: boolean;
  maxBatch: number;
  onImported: (results: ImportResult[]) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [original, setOriginal] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [sort, setSort] = useState<XhsSortOption>("general");
  const [period, setPeriod] = useState<XhsPeriodOption>("21");
  const [notes, setNotes] = useState<XhsNote[]>([]);
  const [next, setNext] = useState<XhsSearchCursor | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, XhsNote>>(new Map());
  const [productId, setProductId] = useState("");
  const [memo, setMemo] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<XhsNote | null>(null);
  // 상세는 이 화면(세션) 안에서 한 번만
  const [details, setDetails] = useState<Record<string, XhsNote | null>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const fail = (e: unknown) => setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "", message: e instanceof Error ? e.message : "실패했습니다." });

  async function search(more = false) {
    if (!keyword.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const r = await api.videos.xhsSearch({ keyword: keyword.trim(), sort, period, cursor: more ? next : null });
      setNotes((prev) => {
        if (!more) return r.notes;
        const seen = new Set(prev.map((n) => n.noteId));
        return [...prev, ...r.notes.filter((n) => !seen.has(n.noteId))];
      });
      if (!more) setSelected(new Map());
      setNext(r.next);
      setSearched(true);
    } catch (e) {
      fail(e);
    } finally {
      setSearching(false);
    }
  }

  async function suggest() {
    if (!keyword.trim()) return;
    setSuggesting(true);
    setError(null);
    try {
      const r = await api.videos.xhsKeywords(keyword.trim());
      setOriginal(keyword.trim());
      setSuggested(r.keywords);
    } catch (e) {
      fail(e);
    } finally {
      setSuggesting(false);
    }
  }

  function toggle(n: XhsNote) {
    setSelected((prev) => {
      const m = new Map(prev);
      if (m.has(n.noteId)) m.delete(n.noteId);
      else if (m.size < maxBatch) m.set(n.noteId, n);
      return m;
    });
  }

  async function importNotes(list: XhsNote[]) {
    if (!list.length) return;
    setImporting(true);
    setError(null);
    try {
      // 기존 URL 가져오기와 같은 함수 (원본 주소 + 제목 힌트)
      const res = await api.videos.importMany(
        list.map((n) => ({ url: n.url, titleHint: n.title })),
        memo,
        productId || null,
      );
      onImported(res);
      const done = new Set(res.filter((r) => r.ok).map((r) => r.url));
      setSelected((prev) => new Map([...prev].filter(([, n]) => !done.has(n.url))));
      setOpen(null);
    } catch (e) {
      fail(e);
    } finally {
      setImporting(false);
    }
  }

  async function openDetail(n: XhsNote) {
    setOpen(n);
    if (n.desc || n.noteId in details) return;
    setDetailLoading(true);
    try {
      const d = await api.videos.xhsDetail(n.noteId);
      setDetails((prev) => ({ ...prev, [n.noteId]: d }));
    } catch {
      setDetails((prev) => ({ ...prev, [n.noteId]: null }));
    } finally {
      setDetailLoading(false);
    }
  }

  const shown = open ? { ...open, ...(details[open.noteId] ?? {}) } : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <FormField label="검색어" htmlFor="xhs-keyword" hint="한국어로 찾기 어려우면 [AI 중국어 검색어 추천]을 눌러 보세요 (누를 때만 AI 1회).">
          <Input
            id="xhs-keyword"
            placeholder="예: 무선청소기 또는 无线吸尘器"
            value={keyword}
            maxLength={60}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
        </FormField>
        <div className="flex items-start pt-6">
          <Button variant="secondary" icon={Sparkles} loading={suggesting} disabled={!keyword.trim()} onClick={() => void suggest()}>
            AI 중국어 검색어 추천
          </Button>
        </div>
      </div>
      {suggested.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-subtle">추천:</span>
          {[...(original ? [original] : []), ...suggested].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKeyword(k)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs transition-colors",
                keyword === k ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong text-fg-muted hover:border-brand-line hover:text-brand",
              )}
            >
              {k}
              {k === original && <span className="ml-1 text-fg-subtle">(원래)</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <FormField label="정렬">
          <SegmentedControl size="sm" options={SORTS} value={sort} onChange={setSort} />
        </FormField>
        <FormField label="기간">
          <SegmentedControl size="sm" options={PERIODS} value={period} onChange={setPeriod} />
        </FormField>
        <p className="pb-2 text-xs text-fg-subtle">콘텐츠 유형: 영상</p>
        <Button className="ml-auto" variant="primary" icon={Search} loading={searching && !notes.length} disabled={!keyword.trim() || searching} onClick={() => void search()}>
          샤오홍슈 검색
        </Button>
      </div>

      {error && (
        <Notice tone={error.code === "TIKHUB_NOT_CONNECTED" ? "info" : "warning"}>
          {error.message}
          {(error.code === "TIKHUB_NOT_CONNECTED" || error.code === "TIKHUB_AUTH") && (
            <>
              {" "}
              <Link href="/settings/api" className="font-medium text-brand hover:underline">
                API 연결하러 가기 →
              </Link>
            </>
          )}
          <span className="mt-1 block text-xs text-fg-subtle">URL 로 가져오기 탭은 그대로 쓸 수 있습니다.</span>
        </Notice>
      )}

      {searched && notes.length > 0 && (
        <div className="sticky top-2 z-10 grid items-end gap-3 rounded-control border border-line bg-canvas/95 p-3 shadow-card backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <FormField label="연관 제품 (선택한 영상 모두에 저장)" htmlFor="xhs-product" optional>
            <Combobox
              id="xhs-product"
              value={productId}
              options={productOptions}
              placeholder={productsLoading ? "불러오는 중…" : "제품 연결 안 함"}
              searchPlaceholder="제품 이름·브랜드로 검색"
              emptyText={productOptions.length ? "검색 결과가 없습니다" : "저장된 제품이 없습니다"}
              onChange={setProductId}
            />
          </FormField>
          <FormField label="메모 (선택한 영상 모두에 저장)" htmlFor="xhs-memo" optional>
            <Input id="xhs-memo" placeholder="예: Hook 참고" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </FormField>
          <Button variant="primary" icon={ListPlus} loading={importing} disabled={!selected.size} onClick={() => void importNotes([...selected.values()])}>
            선택한 {selected.size}개 가져오기
          </Button>
        </div>
      )}

      {searched && (
        <div className="space-y-3">
          <p className="text-xs text-fg-subtle">
            영상 {notes.length}개{period === "21" || period === "30" ? ` · 게시일 기준 최근 ${period}일만` : ""} · 최대 {maxBatch}개까지 골라 가져올 수 있습니다
          </p>
          {notes.length === 0 ? (
            <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-subtle">조건에 맞는 영상이 없습니다. 검색어나 기간을 바꿔 보세요.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {notes.map((n) => {
                const on = selected.has(n.noteId);
                return (
                  <li key={n.noteId} className={cn("overflow-hidden rounded-card border bg-canvas", on ? "border-brand ring-2 ring-brand-soft" : "border-line")}>
                    <button type="button" className="relative block aspect-[3/4] w-full bg-[#ffe3e3]" onClick={() => void openDetail(n)} title="상세보기">
                      {n.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 샤오홍슈 CDN 썸네일 (저장하지 않음)
                        <img src={n.coverUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-xs text-fg-subtle">미리보기 없음</span>
                      )}
                      {dur(n.durationSec) && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{dur(n.durationSec)}</span>}
                    </button>
                    <div className="space-y-1.5 px-3 py-2.5">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" checked={on} disabled={!on && selected.size >= maxBatch} onChange={() => toggle(n)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
                        <span className="line-clamp-2 text-[13px] leading-snug font-medium text-fg">{n.title}</span>
                      </label>
                      <p className="truncate text-xs text-fg-subtle">{[n.author, day(n.publishedAt)].filter(Boolean).join(" · ")}</p>
                      <p className="tabular flex flex-wrap gap-x-2.5 text-xs text-fg-muted">
                        {num(n.likes) && (
                          <span className="inline-flex items-center gap-0.5">
                            <Heart className="size-3" />
                            {num(n.likes)}
                          </span>
                        )}
                        {num(n.comments) && (
                          <span className="inline-flex items-center gap-0.5">
                            <MessageCircle className="size-3" />
                            {num(n.comments)}
                          </span>
                        )}
                        {num(n.collects) && (
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="size-3" />
                            {num(n.collects)}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {next && (
            <div className="text-center">
              <Button size="sm" variant="ghost" loading={searching} onClick={() => void search(true)}>
                더 보기
              </Button>
            </div>
          )}
        </div>
      )}

      <Drawer
        open={Boolean(shown)}
        onClose={() => setOpen(null)}
        title={shown?.title ?? ""}
        footer={
          shown && (
            <div className="flex gap-2">
              <a
                href={shown.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-line text-sm text-fg-muted hover:text-brand"
              >
                <ExternalLink className="size-4" />
                샤오홍슈에서 보기
              </a>
              <Button className="flex-1" variant="primary" icon={ListPlus} loading={importing} onClick={() => void importNotes([shown])}>
                이 영상 가져오기
              </Button>
            </div>
          )
        }
      >
        {shown && (
          <div className="space-y-3 text-sm">
            {shown.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- 샤오홍슈 CDN 썸네일 (저장하지 않음)
              <img src={shown.coverUrl} alt="" referrerPolicy="no-referrer" className="max-h-80 w-full rounded-control object-contain bg-subtle" />
            )}
            <dl className="grid grid-cols-[72px_1fr] gap-y-1.5 text-[13px]">
              {shown.author && (
                <>
                  <dt className="text-fg-subtle">작성자</dt>
                  <dd>{shown.author}</dd>
                </>
              )}
              {day(shown.publishedAt) && (
                <>
                  <dt className="text-fg-subtle">게시일</dt>
                  <dd>{day(shown.publishedAt)}</dd>
                </>
              )}
              {num(shown.likes) && (
                <>
                  <dt className="text-fg-subtle">좋아요</dt>
                  <dd>{num(shown.likes)}</dd>
                </>
              )}
              {num(shown.comments) && (
                <>
                  <dt className="text-fg-subtle">댓글</dt>
                  <dd>{num(shown.comments)}</dd>
                </>
              )}
              {num(shown.collects) && (
                <>
                  <dt className="text-fg-subtle">저장</dt>
                  <dd>{num(shown.collects)}</dd>
                </>
              )}
              {dur(shown.durationSec) && (
                <>
                  <dt className="text-fg-subtle">길이</dt>
                  <dd>{dur(shown.durationSec)}</dd>
                </>
              )}
            </dl>
            {shown.desc ? (
              <p className="rounded-control bg-subtle px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">{shown.desc}</p>
            ) : (
              <p className="text-xs text-fg-subtle">{detailLoading ? "설명 불러오는 중…" : "설명이 없습니다."}</p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
