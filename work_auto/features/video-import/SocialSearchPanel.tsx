"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Heart, Languages, ListPlus, MessageCircle, Search, Share2, Star } from "lucide-react";
import type {
  ReferenceVideo,
  SocialPeriodOption,
  SocialPlatform,
  SocialPlatformResult,
  SocialQueryTranslation,
  SocialQueryType,
  SocialSortOption,
  SocialVideoItem,
  XhsNote,
} from "@/lib/types";
import { ApiError, api } from "@/lib/api-client";
import { Badge, Button, Checkbox, Combobox, Drawer, FormField, Input, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SaveTitlesToFormat } from "@/features/ai-learning/SaveTitlesToFormat";

type PlatformChoice = SocialPlatform | "both";

const PLATFORM_CHOICES: { value: PlatformChoice; label: string }[] = [
  { value: "xiaohongshu", label: "샤오홍슈" },
  { value: "douyin", label: "도우인" },
  { value: "both", label: "둘 다" },
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
const QUERY_LABEL: Record<SocialQueryType, string> = { original: "입력 그대로", primary: "1순위", alternate: "보조", english: "영어" };

const num = (n: number | null) => (n == null ? null : n >= 10_000 ? `${Math.round(n / 1000) / 10}만` : n.toLocaleString("ko-KR"));
const dur = (s: number | null) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }) : null);
const keyOf = (it: SocialVideoItem) => `${it.platform}:${it.sourceId}`;

type ImportResult = { url: string; ok: boolean; video?: ReferenceVideo; error?: string };

/**
 * 영상 URL 가져오기 › [영상 검색] 탭 (docs/SOCIAL_VIDEO_SOURCING.md)
 * 샤오홍슈·도우인·둘 다 → 한국어 검색어는 서버가 AI 로 한 번 변환 → 플랫폼별 결과 (모자랄 때만 보조 검색어)
 * 여러 개 체크 → [선택한 영상 가져오기] = URL 가져오기와 같은 api.videos.importMany() (원본 URL + 제목)
 * 검색 결과는 이 화면에만 있고 저장하지 않는다. TikHub 가 안 돼도 URL 가져오기 탭은 그대로 쓴다.
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
  const [choice, setChoice] = useState<PlatformChoice>("xiaohongshu");
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [sort, setSort] = useState<SocialSortOption>("general");
  const [period, setPeriod] = useState<SocialPeriodOption>("21");
  const [results, setResults] = useState<SocialPlatformResult[]>([]);
  const [translation, setTranslation] = useState<SocialQueryTranslation | null>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState<"all" | SocialPlatform | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, SocialVideoItem>>(new Map());
  const [productId, setProductId] = useState("");
  const [memo, setMemo] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<SocialVideoItem | null>(null);
  // 샤오홍슈 상세는 이 화면(세션) 안에서 한 번만 (도우인은 검색 결과에 설명이 있다)
  const [details, setDetails] = useState<Record<string, XhsNote | null>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  const platforms: SocialPlatform[] = choice === "both" ? ["xiaohongshu", "douyin"] : [choice];
  const sorts = platforms.includes("douyin") ? SORTS_ALL.slice(0, 3) : SORTS_ALL;
  const total = results.reduce((s, r) => s + r.items.length, 0);

  const fail = (e: unknown) => setError(e instanceof ApiError ? { code: e.code, message: e.message } : { code: "", message: e instanceof Error ? e.message : "실패했습니다." });

  function changeChoice(next: PlatformChoice) {
    setChoice(next);
    if (next !== "xiaohongshu" && (sort === "comments" || sort === "collects")) setSort("general");
  }

  async function search() {
    if (!keyword.trim()) return;
    setSearching("all");
    setError(null);
    try {
      const r = await api.videos.socialSearch({ keyword: keyword.trim(), platforms, autoTranslate, sort, period });
      setResults(r.platforms);
      setTranslation(r.translation);
      setTranslationError(r.translationError);
      setSelected(new Map());
      setSearched(true);
    } catch (e) {
      fail(e);
    } finally {
      setSearching(null);
    }
  }

  /** 한 플랫폼만 이어서 (번역·다른 플랫폼은 다시 부르지 않는다) */
  async function more(r: SocialPlatformResult) {
    if (!r.next) return;
    setSearching(r.platform);
    setError(null);
    try {
      const res = await api.videos.socialSearch({ keyword: keyword.trim() || r.next.query, platforms: [r.platform], autoTranslate: false, sort, period, continue: { platform: r.platform, next: r.next } });
      const got = res.platforms[0];
      setResults((prev) =>
        prev.map((p) => {
          if (p.platform !== r.platform) return p;
          const seen = new Set(p.items.map(keyOf));
          return { ...p, items: [...p.items, ...got.items.filter((x) => !seen.has(keyOf(x)))], next: got.next, error: got.error, calls: p.calls + got.calls };
        }),
      );
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
      // 기존 URL 가져오기와 같은 함수 (원본 주소 + 제목 힌트)
      const res = await api.videos.importMany(
        list.map((it) => ({ url: it.originalUrl, titleHint: it.title })),
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

  async function openDetail(it: SocialVideoItem) {
    setOpen(it);
    if (it.platform !== "xiaohongshu" || it.desc || it.sourceId in details) return;
    setDetailLoading(true);
    try {
      const d = await api.videos.xhsDetail(it.sourceId);
      setDetails((prev) => ({ ...prev, [it.sourceId]: d }));
    } catch {
      setDetails((prev) => ({ ...prev, [it.sourceId]: null }));
    } finally {
      setDetailLoading(false);
    }
  }

  const extra = open && open.platform === "xiaohongshu" ? details[open.sourceId] : null;
  const shown: SocialVideoItem | null = open
    ? extra
      ? { ...open, desc: extra.desc ?? open.desc, likeCount: extra.likes ?? open.likeCount, commentCount: extra.comments ?? open.commentCount, collectCount: extra.collects ?? open.collectCount }
      : open
    : null;
  const pickedTitles = [...selected.values()].map((it) => ({ title: it.title, views: null }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <FormField label="플랫폼">
          <SegmentedControl size="sm" options={PLATFORM_CHOICES} value={choice} onChange={changeChoice} />
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
            ? "한국어로 넣으면 기본 AI 가 중국어 검색어로 한 번 바꿔 검색합니다 (결과가 모자랄 때만 다른 표현으로 한 번 더). 중국어·영어는 그대로 검색합니다."
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
        <p className="pb-2 text-xs text-fg-subtle">콘텐츠 유형: 영상</p>
        <Button className="ml-auto" variant="primary" icon={Search} loading={searching === "all"} disabled={!keyword.trim() || Boolean(searching)} onClick={() => void search()}>
          {choice === "both" ? "둘 다 검색" : `${PLATFORM_NAME[choice]} 검색`}
        </Button>
      </div>

      {error && <TikHubNotice error={error} />}

      {searched && translation?.translated && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <Languages className="size-3.5 text-fg-subtle" />
          <span>
            &lsquo;{translation.original}&rsquo; → <b className="font-medium text-fg">{translation.primaryZh}</b>
          </span>
          {translation.alternateZh && <span className="text-fg-subtle">· 보조 {translation.alternateZh}</span>}
          {translation.english && <span className="text-fg-subtle">· 영어 {translation.english}</span>}
        </p>
      )}
      {searched && translationError && <Notice tone="warning">{translationError}</Notice>}

      {searched && total > 0 && (
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

      {searched &&
        results.map((r) => (
          <section key={r.platform} className="space-y-3" data-platform={r.platform}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", PLATFORM_TONE[r.platform])}>{PLATFORM_NAME[r.platform]}</span>
              <span className="text-xs text-fg-subtle">
                영상 {r.items.length}개{period === "21" || period === "30" ? ` · 게시일 기준 최근 ${period}일만` : ""}
                {r.queriesUsed.length > 0 && ` · 검색어 ${r.queriesUsed.map((q) => `${q.query}(${QUERY_LABEL[q.type]} ${q.count})`).join(", ")}`}
              </span>
            </div>
            {r.error ? (
              <TikHubNotice error={r.error} />
            ) : r.items.length === 0 ? (
              <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-fg-subtle">조건에 맞는 영상이 없습니다. 검색어나 기간을 바꿔 보세요.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {r.items.map((it) => (
                  <ResultCard key={keyOf(it)} item={it} on={selected.has(keyOf(it))} full={selected.size >= maxBatch} onToggle={() => toggle(it)} onOpen={() => void openDetail(it)} />
                ))}
              </ul>
            )}
            {r.next && !r.error && (
              <div className="text-center">
                <Button size="sm" variant="ghost" loading={searching === r.platform} disabled={Boolean(searching)} onClick={() => void more(r)}>
                  {PLATFORM_NAME[r.platform]} 더 보기
                </Button>
              </div>
            )}
          </section>
        ))}
      {searched && <p className="text-xs text-fg-subtle">최대 {maxBatch}개까지 골라 가져올 수 있습니다. 검색 결과는 저장되지 않습니다.</p>}

      <Drawer
        open={Boolean(shown)}
        onClose={() => setOpen(null)}
        title={shown?.title ?? ""}
        footer={
          shown && (
            <div className="flex gap-2">
              <a
                href={shown.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-line text-sm text-fg-muted hover:text-brand"
              >
                <ExternalLink className="size-4" />
                {PLATFORM_NAME[shown.platform]}에서 보기
              </a>
              <Button className="flex-1" variant="primary" icon={ListPlus} loading={importing} onClick={() => void importItems([shown])}>
                이 영상 가져오기
              </Button>
            </div>
          )
        }
      >
        {shown && (
          <div className="space-y-3 text-sm">
            {shown.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- 업체 CDN 썸네일 (저장하지 않음)
              <img src={shown.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="max-h-80 w-full rounded-control bg-subtle object-contain" />
            )}
            <dl className="grid grid-cols-[72px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-fg-subtle">플랫폼</dt>
              <dd>{PLATFORM_NAME[shown.platform]}</dd>
              {(
                [
                  ["작성자", shown.authorName],
                  ["게시일", day(shown.publishedAt)],
                  ["좋아요", num(shown.likeCount)],
                  ["댓글", num(shown.commentCount)],
                  ["저장", num(shown.collectCount)],
                  ["공유", num(shown.shareCount)],
                  ["길이", dur(shown.durationSec)],
                  ["검색어", `${shown.matchedQuery} (${QUERY_LABEL[shown.queryType]})`],
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
            {shown.desc ? (
              <p className="rounded-control bg-subtle px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">{shown.desc}</p>
            ) : (
              <p className="text-xs text-fg-subtle">{detailLoading ? "설명 불러오는 중…" : "설명이 없습니다."}</p>
            )}
            <SaveTitlesToFormat titles={[{ title: shown.title, views: null }]} source="영상 검색" buttonLabel="제목 대본 포맷에 담기" />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ResultCard({ item: it, on, full, onToggle, onOpen }: { item: SocialVideoItem; on: boolean; full: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li className={cn("overflow-hidden rounded-card border bg-canvas", on ? "border-brand ring-2 ring-brand-soft" : "border-line")}>
      <button type="button" className={cn("relative block aspect-[3/4] w-full", COVER_BG[it.platform])} onClick={onOpen} title="상세보기">
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
        {(it.queryType === "alternate" || it.queryType === "english" || it.similarGroup) && (
          <div className="flex flex-wrap gap-1">
            {it.queryType !== "primary" && it.queryType !== "original" && <Badge tone="neutral">{QUERY_LABEL[it.queryType]} 검색어</Badge>}
            {it.similarGroup && (
              <Badge tone="warning">
                <Copy className="mr-0.5 inline size-3" />
                유사 영상 가능성
              </Badge>
            )}
          </div>
        )}
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
