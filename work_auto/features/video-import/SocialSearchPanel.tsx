"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Heart, Languages, ListPlus, MessageCircle, Search, Share2, Star } from "lucide-react";
import type {
  ReferenceVideo,
  SocialContinue,
  SocialPeriodOption,
  SocialPlatform,
  SocialQueryTranslation,
  SocialSortOption,
  SocialVideoItem,
} from "@/lib/types";
import { ApiError, api } from "@/lib/api-client";
import { Button, Checkbox, Combobox, Drawer, FormField, Input, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SaveTitlesToFormat } from "@/features/ai-learning/SaveTitlesToFormat";

const PLATFORM_CHOICES: { value: SocialPlatform; label: string }[] = [
  { value: "xiaohongshu", label: "샤오홍슈" },
  { value: "douyin", label: "도우인" },
];
const PLATFORM_NAME: Record<SocialPlatform, string> = { xiaohongshu: "샤오홍슈", douyin: "도우인" };
const PLATFORM_TONE: Record<SocialPlatform, string> = {
  xiaohongshu: "bg-[#ff2442] text-white",
  douyin: "bg-[#161823] text-white",
};
const COVER_BG: Record<SocialPlatform, string> = { xiaohongshu: "bg-[#ffe3e3]", douyin: "bg-[#e8e8f0]" };
// 도우인은 종합·최신·좋아요만 (업체 정렬이 3가지)
const SORTS_ALL: { value: SocialSortOption; label: string }[] = [
  { value: "general", label: "종합" },
  { value: "latest", label: "최신순" },
  { value: "likes", label: "좋아요순" },
  { value: "comments", label: "댓글순" },
  { value: "collects", label: "저장순" },
];
const PERIODS: { value: SocialPeriodOption; label: string }[] = [
  { value: "7", label: "최근 7일" },
  { value: "21", label: "최근 21일" },
  { value: "30", label: "최근 30일" },
  { value: "all", label: "전체" },
];

const num = (n: number | null) => (n == null ? null : n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : n.toLocaleString("ko-KR"));
const dur = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }) : null);
const keyOf = (it: SocialVideoItem) => `${it.platform}:${it.sourceId}`;

type ImportResult = { url: string; ok: boolean; video?: ReferenceVideo; error?: string };

/* ── 검색 결과 세션 기억 (DB 저장 없음) ───────────────
 * 같은 조건(플랫폼·검색어·자동 변환·정렬·기간)을 이 브라우저 세션에서 다시 검색하면 서버·TikHub 를 부르지 않고 보여 준다.
 * [더 보기]로 받은 결과까지 함께 기억한다. 30분 지나면 버린다 (socialVideoSearchConfig.searchCacheTtlMinutes).
 */
const SEARCH_CACHE_TTL_MS = 30 * 60 * 1000;
const STORAGE_KEY = "social-search-cache-v1";
type CachedSearch = { at: number; translation: SocialQueryTranslation; translationError: string | null; items: SocialVideoItem[]; next: SocialContinue | null; filteredByDate: boolean };
const memoryCache = new Map<string, CachedSearch>();

function readCache(key: string): CachedSearch | null {
  let hit = memoryCache.get(key) ?? null;
  if (!hit) {
    try {
      const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, CachedSearch>;
      hit = all[key] ?? null;
    } catch {
      hit = null;
    }
  }
  return hit && Date.now() - hit.at < SEARCH_CACHE_TTL_MS ? hit : null;
}
function writeCache(key: string, value: CachedSearch) {
  memoryCache.set(key, value);
  try {
    const all = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, CachedSearch>;
    // 오래된 것은 지우고 최근 20개만 (브라우저 저장 공간 보호)
    const fresh = Object.entries({ ...all, [key]: value })
      .filter(([, v]) => Date.now() - v.at < SEARCH_CACHE_TTL_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 20);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* 저장 공간이 없거나 막혀 있으면 메모리 기억만 */
  }
}

/**
 * 영상 URL 가져오기 › [영상 검색] 탭 (docs/SOCIAL_VIDEO_SOURCING.md 「비용 정책」)
 * - [검색] = TikHub 검색 1회 (같은 조건은 30분 동안 다시 부르지 않음), [더 보기] = 1회 더. 자동 추가 호출 없음
 * - 한국어 검색어는 서버가 AI 로 중국어 1개로 바꾼다 (같은 검색어는 플랫폼을 바꿔도 다시 바꾸지 않음)
 * - [선택한 영상 가져오기] = 기존 api.videos.importMany() + 검색 결과에 있는 작성자·길이·썸네일 → 상세 API 0회
 * - 검색 결과는 이 화면과 브라우저 세션에만 있고 DB 에 저장하지 않는다
 */
export function SocialSearchPanel({
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
  const [platform, setPlatform] = useState<SocialPlatform>("xiaohongshu");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [sort, setSort] = useState<SocialSortOption>("general");
  const [period, setPeriod] = useState<SocialPeriodOption>("21");
  // 지금 보이는 검색 (어떤 조건의 결과인지 함께 둔다)
  const [view, setView] = useState<(CachedSearch & { key: string; platform: SocialPlatform; fromCache: boolean }) | null>(null);
  const [searching, setSearching] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, SocialVideoItem>>(new Map());
  const [productId, setProductId] = useState("");
  const [memo, setMemo] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<SocialVideoItem | null>(null);

  const sorts = platform === "douyin" ? SORTS_ALL.slice(0, 3) : SORTS_ALL;
  const cacheKey = (k = keyword.trim()) => JSON.stringify([platform, k, autoTranslate, sort, period]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "", message: e instanceof Error ? e.message : "실패했습니다." });

  function changePlatform(next: SocialPlatform) {
    setPlatform(next);
    if (next === "douyin" && (sort === "comments" || sort === "collects")) setSort("general");
  }

  async function search() {
    const k = keyword.trim();
    if (!k) return;
    setError(null);
    const key = cacheKey(k);
    const hit = readCache(key);
    if (hit) {
      // 같은 조건: TikHub·AI 를 다시 부르지 않는다
      setView({ ...hit, key, platform, fromCache: true });
      setSelected(new Map());
      return;
    }
    setSearching("search");
    try {
      const r = await api.videos.socialSearch({ keyword: k, platform, autoTranslate, sort, period });
      const entry: CachedSearch = { at: Date.now(), translation: r.translation, translationError: r.translationError, items: r.items, next: r.next, filteredByDate: r.filteredByDate };
      writeCache(key, entry);
      setView({ ...entry, key, platform, fromCache: false });
      setSelected(new Map());
    } catch (e) {
      fail(e);
    } finally {
      setSearching(null);
    }
  }

  /** [더 보기]: 다음 페이지 1회 (번역 다시 안 함) */
  async function more() {
    if (!view?.next) return;
    setSearching("more");
    setError(null);
    try {
      const r = await api.videos.socialSearch({ keyword: view.translation.original, platform: view.platform, autoTranslate: false, sort, period, next: view.next });
      const seen = new Set(view.items.map(keyOf));
      const entry: CachedSearch = { ...view, items: [...view.items, ...r.items.filter((x) => !seen.has(keyOf(x)))], next: r.next };
      writeCache(view.key, { ...entry, at: view.at });
      setView({ ...entry, key: view.key, platform: view.platform, fromCache: false });
    } catch (e) {
      fail(e);
    } finally {
      setSearching(null);
    }
  }

  function toggle(it: SocialVideoItem) {
    setSelected((prev) => {
      const m = new Map(prev);
      const k = keyOf(it);
      if (m.has(k)) m.delete(k);
      else if (m.size < maxBatch) m.set(k, it);
      return m;
    });
  }

  async function importItems(list: SocialVideoItem[]) {
    if (!list.length) return;
    setImporting(true);
    setError(null);
    try {
      // 기존 URL 가져오기와 같은 함수. 검색 결과에 있는 값을 같이 넘겨 서버가 상세 API 를 부르지 않게 한다
      const res = await api.videos.importMany(
        list.map((it) => ({ url: it.originalUrl, titleHint: it.title, meta: { channelName: it.authorName, durationSec: it.durationSec, thumbnailUrl: it.thumbnailUrl } })),
        memo,
        productId || null,
      );
      onImported(res);
      const done = new Set(res.filter((r) => r.ok).map((r) => r.url));
      setSelected((prev) => new Map([...prev].filter(([, it]) => !done.has(it.originalUrl))));
      setOpen(null);
    } catch (e) {
      fail(e);
    } finally {
      setImporting(false);
    }
  }

  const items = view?.items ?? [];
  const pickedTitles = [...selected.values()].map((it) => ({ title: it.title, views: null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <FormField label="플랫폼">
          <SegmentedControl size="sm" options={PLATFORM_CHOICES} value={platform} onChange={changePlatform} />
        </FormField>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-[13px] text-fg-muted">
          <Checkbox checked={autoTranslate} onChange={setAutoTranslate} label="한국어 검색어 자동 변환" />
          한국어 검색어 자동 변환
        </label>
      </div>
      <FormField
        label="검색어"
        htmlFor="social-keyword"
        hint={
          autoTranslate
            ? "한국어로 넣으면 기본 AI 가 중국어 검색어 1개로 바꿔 검색합니다. 중국어·영어는 그대로 검색합니다."
            : "입력한 검색어 그대로 검색합니다."
        }
      >
        <Input
          id="social-keyword"
          placeholder="예: 다이슨 무선청소기 또는 戴森 吸尘器"
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

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <FormField label="정렬">
          <SegmentedControl size="sm" options={sorts} value={sort} onChange={setSort} />
        </FormField>
        <FormField label="기간">
          <SegmentedControl size="sm" options={PERIODS} value={period} onChange={setPeriod} />
        </FormField>
        <p className="pb-2 text-xs text-fg-subtle">콘텐츠 유형: 영상 · 검색 1번 = TikHub 1회</p>
        <Button className="ml-auto" variant="primary" icon={Search} loading={searching === "search"} disabled={!keyword.trim() || Boolean(searching)} onClick={() => void search()}>
          {PLATFORM_NAME[platform]} 검색
        </Button>
      </div>

      {error && <TikHubNotice error={error} />}

      {view && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted" data-search-summary>
          {view.translation.translated && (
            <>
              <Languages className="size-3.5 text-fg-subtle" />
              <span>
                &lsquo;{view.translation.original}&rsquo; → <b className="font-medium text-fg">{view.translation.query}</b>
              </span>
              <span className="text-fg-subtle">·</span>
            </>
          )}
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", PLATFORM_TONE[view.platform])}>{PLATFORM_NAME[view.platform]}</span>
          <span>
            영상 {items.length}개{view.filteredByDate ? ` · 게시일 기준 최근 ${period}일만` : ""}
          </span>
          {view.fromCache && <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">이미 검색한 결과 · API 호출 없음</span>}
        </p>
      )}
      {view?.translationError && <Notice tone="warning">{view.translationError}</Notice>}

      {view && items.length > 0 && (
        <div className="sticky top-2 z-10 grid items-end gap-3 rounded-control border border-line bg-canvas/95 p-3 shadow-card backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <FormField label="연관 제품 (선택한 영상 모두에 저장)" htmlFor="social-product" optional>
            <Combobox
              id="social-product"
              value={productId}
              options={productOptions}
              placeholder={productsLoading ? "불러오는 중…" : "제품 연결 안 함"}
              searchPlaceholder="제품 이름·브랜드로 검색"
              emptyText={productOptions.length ? "검색 결과가 없습니다" : "저장된 제품이 없습니다"}
              onChange={setProductId}
            />
          </FormField>
          <FormField label="메모 (선택한 영상 모두에 저장)" htmlFor="social-memo" optional>
            <Input id="social-memo" placeholder="예: Hook 참고" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </FormField>
          <SaveTitlesToFormat titles={pickedTitles} source="영상 검색" buttonLabel={`제목 ${selected.size}개 대본 포맷에 담기`} disabled={!selected.size} />
          <Button variant="primary" icon={ListPlus} loading={importing} disabled={!selected.size} onClick={() => void importItems([...selected.values()])}>
            선택한 {selected.size}개 가져오기
          </Button>
        </div>
      )}

      {view && (
        <section className="space-y-3" data-platform={view.platform}>
          {items.length === 0 ? (
            <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-subtle">
              {view.next ? "이 페이지에는 조건에 맞는 영상이 없습니다. [더 보기]로 다음 결과를 볼 수 있습니다." : "조건에 맞는 영상이 없습니다. 검색어나 기간을 바꿔 보세요."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((it) => (
                <ResultCard key={keyOf(it)} item={it} on={selected.has(keyOf(it))} full={selected.size >= maxBatch} onToggle={() => toggle(it)} onOpen={() => setOpen(it)} />
              ))}
            </ul>
          )}
          {view.next && (
            <div className="text-center">
              <Button size="sm" variant="ghost" loading={searching === "more"} disabled={Boolean(searching)} onClick={() => void more()} title="다음 결과를 불러옵니다 (TikHub 1회)">
                더 보기
              </Button>
            </div>
          )}
          <p className="text-xs text-fg-subtle">
            최대 {maxBatch}개까지 골라 가져올 수 있습니다. 검색 결과는 저장되지 않고, 가져온 영상만 저장됩니다. 같은 조건은 30분 동안 다시 불러오지 않습니다.
          </p>
        </section>
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.title ?? ""}
        footer={
          open && (
            <div className="flex gap-2">
              <a
                href={open.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-line text-sm text-fg-muted hover:text-brand"
              >
                <ExternalLink className="size-4" />
                {PLATFORM_NAME[open.platform]}에서 보기
              </a>
              <Button className="flex-1" variant="primary" icon={ListPlus} loading={importing} onClick={() => void importItems([open])}>
                이 영상 가져오기
              </Button>
            </div>
          )
        }
      >
        {open && (
          <div className="space-y-3 text-sm">
            {open.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- 업체 CDN 썸네일 (저장하지 않음)
              <img src={open.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="max-h-80 w-full rounded-control bg-subtle object-contain" />
            )}
            <dl className="grid grid-cols-[72px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-fg-subtle">플랫폼</dt>
              <dd>{PLATFORM_NAME[open.platform]}</dd>
              {(
                [
                  ["작성자", open.authorName],
                  ["게시일", day(open.publishedAt)],
                  ["좋아요", num(open.likeCount)],
                  ["댓글", num(open.commentCount)],
                  ["저장", num(open.collectCount)],
                  ["공유", num(open.shareCount)],
                  ["길이", dur(open.durationSec)],
                  ["검색어", open.matchedQuery],
                ] as const
              ).map(([k, v]) =>
                v ? (
                  <div key={k} className="contents">
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ) : null,
              )}
            </dl>
            {open.desc ? (
              <p className="rounded-control bg-subtle px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">{open.desc}</p>
            ) : (
              <p className="text-xs text-fg-subtle">검색 결과에 설명이 없습니다. (비용을 줄이려고 상세 API 는 부르지 않습니다 — {PLATFORM_NAME[open.platform]}에서 보기로 확인하세요)</p>
            )}
            <SaveTitlesToFormat titles={[{ title: open.title, views: null }]} source="영상 검색" buttonLabel="제목 대본 포맷에 담기" />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ResultCard({ item: it, on, full, onToggle, onOpen }: { item: SocialVideoItem; on: boolean; full: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className={cn("overflow-hidden rounded-card border bg-canvas", on ? "border-brand ring-2 ring-brand-soft" : "border-line")}>
      <button type="button" className={cn("relative block aspect-[3/4] w-full", COVER_BG[it.platform])} onClick={onOpen} title="자세히 보기">
        {it.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 업체 CDN 썸네일 (저장하지 않음)
          <img src={it.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-xs text-fg-subtle">미리보기 없음</span>
        )}
        <span className={cn("absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", PLATFORM_TONE[it.platform])}>{PLATFORM_NAME[it.platform]}</span>
        {dur(it.durationSec) && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{dur(it.durationSec)}</span>}
      </button>
      <div className="space-y-1.5 px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={on} disabled={!on && full} onChange={onToggle} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" />
          <span className="line-clamp-2 text-[13px] leading-snug font-medium text-fg">{it.title}</span>
        </label>
        <p className="truncate text-xs text-fg-subtle">{[it.authorName, day(it.publishedAt)].filter(Boolean).join(" · ")}</p>
        <p className="tabular flex flex-wrap gap-x-2.5 text-xs text-fg-muted">
          {num(it.likeCount) && (
            <span className="inline-flex items-center gap-0.5">
              <Heart className="size-3" />
              {num(it.likeCount)}
            </span>
          )}
          {num(it.commentCount) && (
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="size-3" />
              {num(it.commentCount)}
            </span>
          )}
          {num(it.collectCount) && (
            <span className="inline-flex items-center gap-0.5">
              <Star className="size-3" />
              {num(it.collectCount)}
            </span>
          )}
          {num(it.shareCount) && (
            <span className="inline-flex items-center gap-0.5">
              <Share2 className="size-3" />
              {num(it.shareCount)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

function TikHubNotice({ error }: { error: { code: string; message: string } }) {
  return (
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
  );
}
