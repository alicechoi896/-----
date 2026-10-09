"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Play, Search, X } from "lucide-react";
import type { IgReel } from "@/lib/types/instagram";
import { api } from "@/lib/api-client";
import { Button, EmptyState, ErrorState, Input, Notice, SectionCard, Select } from "@/components/ui";
import { MakeMenu } from "@/components/shared/MakeMenu";
import { ScrapButton } from "@/components/shared/ScrapButton";
import { SaveTitlesToFormat } from "@/features/ai-learning/SaveTitlesToFormat";
import { infoVideoHref, productVideoHref } from "@/features/youtube-trends/trend-links";
import { cn, formatNumber, formatRelative } from "@/lib/utils";

type Sort = "plays" | "likes" | "comments" | "recent" | "ratio";
const SORTS: { value: Sort; label: string }[] = [
  { value: "plays", label: "조회수 많은 순" },
  { value: "ratio", label: "팔로워 대비 조회수 순" },
  { value: "likes", label: "좋아요 많은 순" },
  { value: "comments", label: "댓글 많은 순" },
  { value: "recent", label: "최신 순" },
];
const PERIODS = [
  { value: "0", label: "전체 기간" },
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 3개월" },
];

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ig-${Date.now()}`);
/** 캡션 첫 문장 (해시태그 앞까지) = 제목처럼 쓴다 */
const titleOf = (r: IgReel) => (r.caption.split(/\s#/)[0] || r.caption).replace(/\s+/g, " ").trim().slice(0, 80) || `@${r.author ?? "릴스"}`;
/** 같은 릴스의 재생 주소 (화면에 있는 동안만) */
const mediaCache = new Map<string, string | null>();

/**
 * 인스타그램 트렌드 찾기 (v0.9.54). docs/INSTAGRAM_TRENDS.md
 * [검색]·[더 보기] 1번 = TikHub 1회. 정렬·기간은 받은 결과 안에서. 해시태그를 누르면 그 해시태그로 다시 검색.
 * 카드 ▶ = 이 화면에서 재생 (재생 주소가 검색 결과에 없을 때만 TikHub 1회).
 */
export function InstagramTrendExplorer() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<IgReel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState<"first" | "more" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("plays");
  const [period, setPeriod] = useState("0");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [playing, setPlaying] = useState<{ code: string; url: string | null; status: "loading" | "ready" | "error"; message?: string } | null>(null);
  const busy = useRef(false);
  const [now, setNow] = useState(() => Date.now());

  // 기다리는 동안 몇 초째인지 보여 준다 (인스타그램 응답이 느릴 때)
  useEffect(() => {
    if (!loading) return;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(timer);
  }, [loading]);

  async function run(more: boolean, kwOverride?: string) {
    const kw = more ? searched : (kwOverride ?? keyword).trim();
    if (busy.current || !kw) return;
    busy.current = true;
    setElapsed(0);
    setLoading(more ? "more" : "first");
    setError(null);
    try {
      const r = await api.trends.instagram({ keyword: kw, next: more ? next : null, clientRequestId: newId() });
      setItems((prev) => {
        if (!more) return r.items;
        const seen = new Set(prev.map((x) => x.code));
        return [...prev, ...r.items.filter((x) => !seen.has(x.code))];
      });
      setNext(r.next);
      setSearched(kw);
      setNow(Date.now());
      if (!more) {
        setPicked(new Set());
        setPlaying(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색하지 못했습니다.");
    } finally {
      busy.current = false;
      setLoading(null);
    }
  }

  function searchTag(tag: string) {
    setKeyword(tag);
    void run(false, tag);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function play(r: IgReel) {
    const known = r.videoUrl ?? mediaCache.get(r.code);
    if (known) return setPlaying({ code: r.code, url: known, status: "ready" });
    setPlaying({ code: r.code, url: null, status: "loading" });
    try {
      const { videoUrl } = await api.trends.instagramMedia(r.code);
      mediaCache.set(r.code, videoUrl);
      setPlaying((p) =>
        p?.code === r.code ? (videoUrl ? { code: r.code, url: videoUrl, status: "ready" } : { code: r.code, url: null, status: "error", message: "재생 주소를 받지 못했습니다. 인스타그램에서 보기를 눌러 주세요." }) : p,
      );
    } catch (e) {
      setPlaying((p) => (p?.code === r.code ? { code: r.code, url: null, status: "error", message: e instanceof Error ? e.message : "재생하지 못했습니다." } : p));
    }
  }

  const shown = useMemo(() => {
    const days = Number(period);
    const from = days ? now - days * 86_400_000 : 0;
    const list = items.filter((r) => !from || (r.postedAt && Date.parse(r.postedAt) >= from));
    const score = (r: IgReel) =>
      sort === "plays" ? (r.plays ?? -1) : sort === "likes" ? (r.likes ?? -1) : sort === "comments" ? (r.comments ?? -1) : sort === "recent" ? Date.parse(r.postedAt ?? "") || 0 : r.plays && r.followers ? r.plays / r.followers : -1;
    return [...list].sort((a, b) => score(b) - score(a));
  }, [items, sort, period, now]);
  const hashtags = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of shown) for (const h of r.hashtags) count.set(h, (count.get(h) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [shown]);
  const pickedReels = shown.filter((r) => picked.has(r.code));

  const toggle = (code: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <div className="space-y-6" data-ig-trends>
      <SectionCard title="검색" icon={Search} description="한국어 검색어 그대로 인스타그램 릴스를 찾습니다. [검색]·[더 보기] 1번 = TikHub 1회(약 $0.01). 같은 검색어는 30분 동안 다시 부르지 않아 바로 나옵니다.">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(false);
          }}
        >
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="예: 무선청소기, 자취템, 갤럭시 워치" className="min-w-60 flex-1" aria-label="검색어" />
          <Button type="submit" variant="primary" icon={Search} loading={loading === "first"} disabled={!keyword.trim()} data-ig-search>
            검색
          </Button>
        </form>
        {loading && (
          <p className="mt-2 text-xs text-fg-subtle" data-ig-wait>
            <Loader2 className="mr-1 inline size-3.5 animate-spin" />
            인스타그램에서 받아오는 중… {elapsed}초 (인스타그램 응답에 보통 수 초가 걸립니다)
          </p>
        )}
      </SectionCard>

      {error && <ErrorState message={error} onRetry={() => void run(false)} />}

      {!searched ? (
        loading !== "first" && (
          <SectionCard>
            <EmptyState icon={Search} title="검색어를 넣고 [검색]을 눌러 주세요" description="처음에는 불러오지 않습니다 (TikHub 비용 절약)." className="py-16" />
          </SectionCard>
        )
      ) : (
        <>
          {hashtags.length > 0 && (
            <SectionCard title="많이 쓰인 해시태그" description="누르면 그 해시태그로 다시 검색합니다 (TikHub 1회).">
              <div className="flex flex-wrap gap-1.5" data-ig-hashtags>
                {hashtags.map(([h, n]) => (
                  <button
                    key={h}
                    type="button"
                    disabled={Boolean(loading)}
                    onClick={() => searchTag(h)}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-canvas px-2.5 text-[12.5px] text-fg hover:border-brand-line hover:text-brand disabled:opacity-50"
                  >
                    #{h} <span className="text-fg-subtle">· {n}</span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
          <SectionCard
            title={`'${searched}' 릴스 · ${shown.length}개`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={period} options={PERIODS} onChange={(e) => setPeriod(e.target.value)} aria-label="기간" />
                <Select value={sort} options={SORTS} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬" />
                <SaveTitlesToFormat
                  titles={pickedReels.map((r) => ({ title: titleOf(r), views: r.plays }))}
                  captions={pickedReels.map((r) => r.caption).filter(Boolean)}
                  source="인스타그램 트렌드"
                  buttonLabel={`캡션 ${picked.size}개 대본 포맷에 담기`}
                  disabled={!picked.size}
                />
              </div>
            }
          >
            {shown.length === 0 ? (
              <EmptyState compact title="조건에 맞는 릴스가 없습니다" description="기간을 넓히거나 다른 검색어로 찾아 보세요." />
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-ig-list>
                {shown.map((r) => {
                  const on = picked.has(r.code);
                  const p = playing?.code === r.code ? playing : null;
                  return (
                    <li key={r.code} className={cn("overflow-hidden rounded-card border bg-canvas", on ? "border-brand ring-2 ring-brand-soft" : "border-line")} data-ig-card>
                      <div className="relative aspect-[9/16] bg-black">
                        {p?.status === "ready" && p.url ? (
                          <>
                            <video
                              src={p.url}
                              controls
                              autoPlay
                              playsInline
                              className="size-full object-contain"
                              onError={() => setPlaying({ code: r.code, url: null, status: "error", message: "재생할 수 없습니다. 인스타그램에서 보기를 눌러 주세요." })}
                              data-ig-player
                            />
                            <button type="button" onClick={() => setPlaying(null)} aria-label="닫기" className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white">
                              <X className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => void play(r)} className="group relative block size-full" aria-label="이 화면에서 재생" data-ig-play>
                            {r.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element -- 인스타그램 썸네일 주소 그대로
                              <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover opacity-90 group-hover:opacity-100" />
                            ) : (
                              <span className="block size-full bg-gradient-to-b from-zinc-700 to-zinc-900" />
                            )}
                            <span className="absolute inset-0 flex items-center justify-center">
                              {p?.status === "loading" ? <Loader2 className="size-8 animate-spin text-white" /> : <Play className="size-9 rounded-full bg-black/50 p-2 text-white" />}
                            </span>
                            {r.plays != null && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">▶ {formatNumber(r.plays)}</span>}
                          </button>
                        )}
                        {p?.status === "error" && <p className="absolute inset-x-1 bottom-8 rounded bg-black/70 px-2 py-1 text-[11px] text-white">{p.message}</p>}
                        <input type="checkbox" checked={on} onChange={() => toggle(r.code)} className="absolute top-1.5 left-1.5 size-4 accent-[var(--color-brand)]" aria-label="고르기" />
                      </div>
                      <div className="space-y-1 p-2.5">
                        <p className="line-clamp-2 text-[12.5px] font-medium text-fg" title={r.caption}>
                          {titleOf(r)}
                        </p>
                        <p className="truncate text-[11px] text-fg-subtle">
                          {r.author ? `@${r.author}` : "작성자 정보 없음"}
                          {r.followers != null && ` · ${formatNumber(r.followers)}`}
                          {r.postedAt && ` · ${formatRelative(r.postedAt)}`}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          좋아요 {r.likes != null ? formatNumber(r.likes) : "-"} · 댓글 {r.comments != null ? formatNumber(r.comments) : "-"}
                        </p>
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <a href={r.url} target="_blank" rel="noreferrer" title="인스타그램에서 보기" aria-label="인스타그램에서 보기" className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-brand">
                            <ExternalLink className="size-3.5" />
                          </a>
                          <span className="flex items-center">
                            <ScrapButton
                              item={{
                                source: "instagram",
                                itemId: r.code,
                                title: titleOf(r),
                                url: r.url,
                                channelName: r.author ? `@${r.author}` : "",
                                thumbnailUrl: r.thumbnailUrl,
                                keywords: r.hashtags.slice(0, 10),
                                views: r.plays,
                                publishedAt: r.postedAt,
                                format: "shorts",
                                meta: { likes: r.likes, comments: r.comments, followers: r.followers, caption: r.caption.slice(0, 500), keyword: searched },
                              }}
                            />
                            <SaveTitlesToFormat titles={[{ title: titleOf(r), views: r.plays }]} captions={r.caption ? [r.caption] : []} source="인스타그램 트렌드" buttonLabel="캡션 대본 포맷에 담기" variant="ghost" iconOnly />
                            <MakeMenu
                              iconOnly
                              label="영상 만들기"
                              items={[
                                { label: "YouTube 제품 홍보 영상", href: productVideoHref({ trendTitle: titleOf(r), keywords: r.hashtags.slice(0, 6) }) },
                                { label: "YouTube 정보성 영상", href: infoVideoHref({ trendTitle: titleOf(r), keywords: r.hashtags.slice(0, 6) }) },
                              ]}
                            />
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-subtle">
              <span>받은 릴스 {items.length}개 · 정렬·기간은 받은 결과 안에서 (추가 호출 없음)</span>
              {next ? (
                <Button size="sm" loading={loading === "more"} disabled={Boolean(loading)} onClick={() => void run(true)} data-ig-more>
                  더 보기 (TikHub 1회)
                </Button>
              ) : (
                <span>인스타그램이 다음 결과를 주지 않았습니다.</span>
              )}
            </div>
          </SectionCard>
          <Notice tone="neutral">릴스는 YouTube 와 같은 영상을 씁니다. [영상 만들기]로 YouTube 원고를 만든 뒤, 업로드 관리에서 Instagram 으로도 예약할 수 있습니다. 스크랩한 릴스는 &lsquo;트렌드 스크랩&rsquo;에서 모아 봅니다.</Notice>
        </>
      )}
    </div>
  );
}
