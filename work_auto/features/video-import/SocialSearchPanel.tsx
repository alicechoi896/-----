"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Heart, Languages, ListPlus, Loader2, MessageCircle, Play, RotateCcw, Search, Share2, Star, X } from "lucide-react";
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
import { isChineseTitle } from "@/lib/social-title";
import { Button, Checkbox, Combobox, FormField, Input, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

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

/* ── 화면 세션 기억 (DB 저장 없음) ─────────────────────
 * ① 검색 결과: 같은 조건(플랫폼·검색어·자동 변환·정렬·기간)은 30분 동안 서버·TikHub 를 부르지 않는다
 * ② 제목 번역: 플랫폼 + sourceId + 원문 제목 → 한국어 (세션 동안)
 * ③ 미리보기 재생 주소: 플랫폼 + sourceId → 주소 (20분, 만료될 수 있어 오래 믿지 않는다)
 */
export const SEARCH_PREVIEW_CONFIG = {
  searchCacheTtlMinutes: 30,
  /** 재생 주소 기억 (분). 검색 응답의 주소도 검색 후 이 시간까지만 쓴다 */
  mediaCacheTtlMinutes: 20,
} as const;
const SEARCH_TTL_MS = SEARCH_PREVIEW_CONFIG.searchCacheTtlMinutes * 60_000;
const MEDIA_TTL_MS = SEARCH_PREVIEW_CONFIG.mediaCacheTtlMinutes * 60_000;

type CachedSearch = { at: number; translation: SocialQueryTranslation; translationError: string | null; items: SocialVideoItem[]; next: SocialContinue | null; filteredByDate: boolean };

function sessionMap<V>(storageKey: string, ttlMs: number | null, max: number) {
  const memory = new Map<string, V & { at: number }>();
  const readAll = (): Record<string, V & { at: number }> => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
    } catch {
      return {};
    }
  };
  return {
    get(key: string): (V & { at: number }) | null {
      const hit = memory.get(key) ?? readAll()[key] ?? null;
      return hit && (ttlMs == null || Date.now() - hit.at < ttlMs) ? hit : null;
    },
    set(key: string, value: V) {
      const entry = { ...value, at: (value as { at?: number }).at ?? Date.now() } as V & { at: number };
      memory.set(key, entry);
      try {
        const fresh = Object.entries({ ...readAll(), [key]: entry })
          .filter(([, v]) => ttlMs == null || Date.now() - v.at < ttlMs)
          .sort((a, b) => b[1].at - a[1].at)
          .slice(0, max);
        sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(fresh)));
      } catch {
        /* 저장 공간이 없거나 막혀 있으면 메모리 기억만 */
      }
    },
  };
}
const searchCache = sessionMap<Omit<CachedSearch, "at"> & { at?: number }>("social-search-cache-v2", SEARCH_TTL_MS, 20);
const titleCache = sessionMap<{ ko: string }>("social-title-cache-v1", null, 500);
const mediaCache = sessionMap<{ url: string }>("social-media-cache-v1", MEDIA_TTL_MS, 50);
const titleKey = (it: SocialVideoItem) => `${keyOf(it)}:${it.title}`;

/** [검색]·[더 보기] 1번마다 하나 (서버 로그에서 '요청 1번 → TikHub 몇 번'을 확인) */
const newRequestId = () => `search_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 미리보기 상태 (동시에 한 영상만) */
type Preview = { key: string; status: "loading" | "ready" | "error"; url?: string; message?: string };

/**
 * 영상 URL 가져오기 › [영상 검색] 탭 (docs/SOCIAL_VIDEO_SOURCING.md)
 * - [검색] = TikHub 검색 1회 (같은 조건 30분 기억), [더 보기] = 1회 더. 결과 카드는 추가 호출 없이 그린다
 * - 중국어 제목은 결과를 먼저 보여 준 뒤 뒤에서 한 페이지를 묶어 AI 1회로 한국어 번역 (기다리지 않음)
 * - ▶ 를 누를 때만 그 카드 안에서 재생: 검색 응답의 재생 주소 → 없으면 그 영상 1개만 주소 찾기. 동시에 하나만
 * - 체크 → [선택한 영상 가져오기] = 기존 api.videos.importMany() + 검색 결과 메타 (상세 API 0회). 재생·검색은 저장하지 않는다
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
  const [view, setView] = useState<(CachedSearch & { key: string; platform: SocialPlatform; fromCache: boolean }) | null>(null);
  const [searching, setSearching] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, SocialVideoItem>>(new Map());
  const [productId, setProductId] = useState("");
  const [memo, setMemo] = useState("");
  const [importing, setImporting] = useState(false);
  // 한국어 제목 (번역이 끝난 것만), 번역 중인 카드
  const [koTitles, setKoTitles] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  // 검색·더 보기 잠금: state 는 다음 렌더에야 바뀌어서, 빠른 더블클릭·검색 중 Enter 를 ref 로 바로 막는다
  const busyRef = useRef(false);

  const sorts = platform === "douyin" ? SORTS_ALL.slice(0, 3) : SORTS_ALL;
  const cacheKey = (k: string) => JSON.stringify([platform, k, autoTranslate, sort, period]);

  const fail = (e: unknown) => setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "", message: e instanceof Error ? e.message : "실패했습니다." });

  function changePlatform(next: SocialPlatform) {
    setPlatform(next);
    if (next === "douyin" && (sort === "comments" || sort === "collects")) setSort("general");
  }

  /** 결과를 먼저 보여 준 뒤, 아직 번역 안 된 중국어 제목만 모아 AI 1회 (실패해도 원문 그대로) */
  function translateInBackground(items: SocialVideoItem[]) {
    const known: Record<string, string> = {};
    const need: SocialVideoItem[] = [];
    for (const it of items) {
      const hit = titleCache.get(titleKey(it));
      if (hit) known[keyOf(it)] = hit.ko;
      else if (isChineseTitle(it.title)) need.push(it);
    }
    if (Object.keys(known).length) setKoTitles((prev) => ({ ...prev, ...known }));
    if (!need.length) return;
    const ids = need.map(keyOf);
    setTranslating((prev) => new Set([...prev, ...ids]));
    void api.videos
      .translateTitles(need.map((it) => ({ id: keyOf(it), title: it.title })))
      .then((r) => {
        const byId = new Map(need.map((it) => [keyOf(it), it]));
        const got: Record<string, string> = {};
        for (const t of r.items) {
          const it = byId.get(t.id);
          if (!it) continue;
          got[t.id] = t.translatedTitle;
          titleCache.set(titleKey(it), { ko: t.translatedTitle });
        }
        setKoTitles((prev) => ({ ...prev, ...got }));
      })
      .catch(() => undefined)
      .finally(() => setTranslating((prev) => new Set([...prev].filter((k) => !ids.includes(k)))));
  }

  /** [검색] 클릭·Enter 에서만 실행 (useEffect·조건 변경으로는 부르지 않는다). 1번 = TikHub 최대 1회 */
  async function search() {
    const k = keyword.trim();
    if (!k || busyRef.current) return;
    setError(null);
    setPreview(null);
    const key = cacheKey(k);
    const hit = searchCache.get(key);
    if (hit) {
      // 같은 조건: TikHub·AI 를 다시 부르지 않는다
      setView({ ...hit, key, platform, fromCache: true });
      setSelected(new Map());
      translateInBackground(hit.items);
      return;
    }
    busyRef.current = true;
    setSearching("search");
    try {
      const r = await api.videos.socialSearch({ keyword: k, platform, autoTranslate, sort, period, clientRequestId: newRequestId() });
      const entry: CachedSearch = { at: Date.now(), translation: r.translation, translationError: r.translationError, items: r.items, next: r.next, filteredByDate: r.filteredByDate };
      searchCache.set(key, entry);
      setView({ ...entry, key, platform, fromCache: false });
      setSelected(new Map());
      translateInBackground(r.items);
    } catch (e) {
      fail(e); // 자동 재시도 없음 — 사용자가 다시 누를 때만
    } finally {
      busyRef.current = false;
      setSearching(null);
    }
  }

  /** [더 보기]: 다음 페이지 1회 (검색어 변환 다시 안 함) */
  async function more() {
    if (!view?.next || busyRef.current) return;
    busyRef.current = true;
    setSearching("more");
    setError(null);
    try {
      const r = await api.videos.socialSearch({ keyword: view.translation.original, platform: view.platform, autoTranslate: false, sort, period, next: view.next, clientRequestId: newRequestId() });
      const seen = new Set(view.items.map(keyOf));
      const added = r.items.filter((x) => !seen.has(keyOf(x)));
      const entry: CachedSearch = { ...view, items: [...view.items, ...added], next: r.next };
      searchCache.set(view.key, entry);
      setView({ ...entry, key: view.key, platform: view.platform, fromCache: false });
      translateInBackground(added);
    } catch (e) {
      fail(e);
    } finally {
      busyRef.current = false;
      setSearching(null);
    }
  }

  /**
   * ▶ 재생: ① 기억한 주소 → ② 검색 응답의 재생 주소(검색 후 20분 안) → ③ 그 영상 1개만 주소 찾기 (/api/videos/resolve)
   * 다른 카드가 재생 중이면 그 카드는 닫힌다 (플레이어는 한 개만 존재)
   */
  async function play(it: SocialVideoItem) {
    const key = keyOf(it);
    const cached = mediaCache.get(key);
    if (cached) return setPreview({ key, status: "ready", url: cached.url });
    if (it.previewUrl && view && Date.now() - view.at < MEDIA_TTL_MS) {
      mediaCache.set(key, { url: it.previewUrl });
      return setPreview({ key, status: "ready", url: it.previewUrl });
    }
    setPreview({ key, status: "loading" });
    try {
      const r = await api.videos.resolve(it.originalUrl);
      // 브라우저에서 잘 열리는 H.264 를 먼저
      const stream = [...r.streams].sort((a, b) => Number(/264|avc/i.test(b.codec)) - Number(/264|avc/i.test(a.codec)))[0];
      if (!stream) throw new Error("재생할 주소가 없습니다.");
      mediaCache.set(key, { url: stream.url });
      setPreview((p) => (p?.key === key ? { key, status: "ready", url: stream.url } : p));
    } catch (e) {
      setPreview((p) => (p?.key === key ? { key, status: "error", message: e instanceof Error ? e.message : "영상 미리보기를 재생할 수 없습니다." } : p));
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

  async function importSelected() {
    const list = [...selected.values()];
    if (!list.length) return;
    setImporting(true);
    setError(null);
    try {
      // 기존 URL 가져오기와 같은 함수. 원문 제목 + 검색 결과에 있는 값을 넘겨 서버가 상세 API 를 부르지 않게 한다
      const res = await api.videos.importMany(
        list.map((it) => ({ url: it.originalUrl, titleHint: it.title, meta: { channelName: it.authorName, durationSec: it.durationSec, thumbnailUrl: it.thumbnailUrl } })),
        memo,
        productId || null,
      );
      onImported(res);
      const done = new Set(res.filter((r) => r.ok).map((r) => r.url));
      setSelected((prev) => new Map([...prev].filter(([, it]) => !done.has(it.originalUrl))));
    } catch (e) {
      fail(e);
    } finally {
      setImporting(false);
    }
  }

  const items = view?.items ?? [];

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
          {searching === "search" ? "검색 중…" : `${PLATFORM_NAME[platform]} 검색`}
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
          {translating.size > 0 && (
            <span className="inline-flex items-center gap-1 text-fg-subtle">
              <Loader2 className="size-3 animate-spin" />
              제목 한국어로 옮기는 중
            </span>
          )}
        </p>
      )}
      {view?.translationError && <Notice tone="warning">{view.translationError}</Notice>}

      {view && items.length > 0 && (
        <div className="sticky top-2 z-10 grid items-end gap-3 rounded-control border border-line bg-canvas/95 p-3 shadow-card backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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
          <Button variant="primary" icon={ListPlus} loading={importing} disabled={!selected.size} onClick={() => void importSelected()}>
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
              {items.map((it) => {
                const k = keyOf(it);
                return (
                  <ResultCard
                    key={k}
                    item={it}
                    koTitle={koTitles[k] ?? null}
                    translating={translating.has(k)}
                    on={selected.has(k)}
                    full={selected.size >= maxBatch}
                    onToggle={() => toggle(it)}
                    preview={preview?.key === k ? preview : null}
                    onPlay={() => void play(it)}
                    onClose={() => setPreview(null)}
                    onPlayerError={() => setPreview((p) => (p?.key === k ? { key: k, status: "error", message: "영상 미리보기를 재생할 수 없습니다." } : p))}
                  />
                );
              })}
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
            ▶ 를 누른 영상만 불러와 카드 안에서 재생합니다 (한 번에 하나). 최대 {maxBatch}개까지 골라 가져올 수 있고, 검색·재생한 영상은 저장되지 않습니다.
          </p>
        </section>
      )}
    </div>
  );
}

function ResultCard({
  item: it,
  koTitle,
  translating,
  on,
  full,
  onToggle,
  preview,
  onPlay,
  onClose,
  onPlayerError,
}: {
  item: SocialVideoItem;
  koTitle: string | null;
  translating: boolean;
  on: boolean;
  full: boolean;
  onToggle: () => void;
  preview: Preview | null;
  onPlay: () => void;
  onClose: () => void;
  onPlayerError: () => void;
}) {
  return (
    <li className={cn("overflow-hidden rounded-card border bg-canvas", on ? "border-brand ring-2 ring-brand-soft" : "border-line")} data-card>
      <div className={cn("relative aspect-[3/4] w-full", COVER_BG[it.platform])}>
        {preview?.status === "ready" && preview.url ? (
          <Player url={preview.url} onError={onPlayerError} />
        ) : (
          <>
            {it.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 업체 CDN 썸네일 (저장하지 않음)
              <img src={it.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="block size-full" aria-label="썸네일 없음" />
            )}
            {preview?.status === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-3 text-center text-[12px] text-white" data-preview-error>
                영상 미리보기를 재생할 수 없습니다.
                <span className="flex gap-1.5">
                  <button type="button" onClick={onPlay} className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30">
                    <RotateCcw className="size-3" />
                    다시 시도
                  </button>
                  <a href={it.originalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded bg-white/20 px-2 py-1 hover:bg-white/30">
                    <ExternalLink className="size-3" />
                    원본 보기
                  </a>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={onPlay}
                disabled={preview?.status === "loading"}
                aria-label="재생"
                title="이 영상만 불러와 여기서 재생합니다"
                className="absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg transition hover:scale-105 hover:bg-black/70"
                data-play
              >
                {preview?.status === "loading" ? <Loader2 className="size-5 animate-spin" /> : <Play className="ml-0.5 size-5 fill-current" />}
              </button>
            )}
          </>
        )}
        <span className={cn("pointer-events-none absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold", PLATFORM_TONE[it.platform])}>{PLATFORM_NAME[it.platform]}</span>
        {preview?.status === "ready" ? (
          <button type="button" onClick={onClose} aria-label="재생 닫기" title="썸네일로 돌아가기" className="absolute top-1.5 right-1.5 z-10 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
            <X className="size-3.5" />
          </button>
        ) : (
          dur(it.durationSec) && <span className="pointer-events-none absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{dur(it.durationSec)}</span>
        )}
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={on} disabled={!on && full} onChange={onToggle} className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand)]" aria-label="가져올 영상으로 선택" />
          <span className="min-w-0">
            <span className="line-clamp-2 text-[13px] leading-snug font-medium text-fg">{koTitle ?? it.title}</span>
            {koTitle && <span className="mt-0.5 line-clamp-1 block text-[11px] text-fg-subtle">{it.title}</span>}
            {!koTitle && translating && <span className="mt-0.5 block text-[11px] text-fg-subtle">번역 중…</span>}
          </span>
        </label>
        <p className="truncate text-xs text-fg-subtle">{[it.authorName, day(it.publishedAt)].filter(Boolean).join(" · ")}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="tabular flex min-w-0 flex-wrap gap-x-2.5 text-xs text-fg-muted">
            {num(it.likeCount) && (
              <span className="inline-flex items-center gap-0.5" title="좋아요">
                <Heart className="size-3" />
                {num(it.likeCount)}
              </span>
            )}
            {num(it.commentCount) && (
              <span className="inline-flex items-center gap-0.5" title="댓글">
                <MessageCircle className="size-3" />
                {num(it.commentCount)}
              </span>
            )}
            {num(it.collectCount) && (
              <span className="inline-flex items-center gap-0.5" title="저장">
                <Star className="size-3" />
                {num(it.collectCount)}
              </span>
            )}
            {num(it.shareCount) && (
              <span className="inline-flex items-center gap-0.5" title="공유">
                <Share2 className="size-3" />
                {num(it.shareCount)}
              </span>
            )}
          </p>
          <a href={it.originalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-fg-subtle hover:text-brand" title={`${PLATFORM_NAME[it.platform]}에서 원본 보기`}>
            <ExternalLink className="size-3" />
            원본
          </a>
        </div>
      </div>
    </li>
  );
}

/** 카드 안 플레이어: ▶ 를 누른 뒤에만 만들어진다 (그 전에는 video 요소·주소 모두 없음). 닫히면 주소를 비워 받기를 멈춘다 */
function Player({ url, onError }: { url: string; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.play().catch(() => undefined); // 자동 재생이 막히면 컨트롤로 직접 재생
    return () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [url]);
  return <video ref={ref} src={url} controls playsInline preload="none" className="size-full bg-black object-contain" onError={onError} data-player />;
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
