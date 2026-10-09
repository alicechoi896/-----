"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { IgReel } from "@/lib/types/instagram";
import { api } from "@/lib/api-client";
import { Button, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select, Tag } from "@/components/ui";
import { MakeMenu } from "@/components/shared/MakeMenu";
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

/**
 * 인스타그램 트렌드 찾기 (v0.9.53). docs/INSTAGRAM_TRENDS.md
 * [검색]·[더 보기] 1번 = TikHub 1회. 정렬·기간은 받은 결과 안에서 (추가 호출 없음).
 * 릴스는 YouTube 와 같은 영상을 쓰므로 [만들기] → YouTube 제품 홍보·정보성 영상 원고로 넘어간다.
 */
export function InstagramTrendExplorer() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<IgReel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState<"first" | "more" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("plays");
  const [period, setPeriod] = useState("0");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const busy = useRef(false);
  // 기간 필터 기준 시각 (검색할 때마다 새로)
  const [now, setNow] = useState(() => Date.now());

  async function run(more: boolean) {
    const kw = more ? searched : keyword.trim();
    if (busy.current || !kw) return;
    busy.current = true;
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
      if (!more) setPicked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "검색하지 못했습니다.");
    } finally {
      busy.current = false;
      setLoading(null);
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
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  }, [shown]);

  const toggle = (code: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <div className="space-y-6" data-ig-trends>
      <SectionCard title="검색" icon={Search} description="한국어 검색어 그대로 인스타그램 릴스를 찾습니다. [검색]·[더 보기] 1번 = TikHub 1회(약 $0.01). 같은 검색어는 30분 동안 다시 부르지 않습니다.">
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
      </SectionCard>

      {error && <ErrorState message={error} onRetry={() => void run(false)} />}

      {loading === "first" ? (
        <LoadingState variant="skeleton" rows={6} />
      ) : !searched ? (
        <SectionCard>
          <EmptyState icon={Search} title="검색어를 넣고 [검색]을 눌러 주세요" description="처음에는 불러오지 않습니다 (TikHub 비용 절약)." className="py-16" />
        </SectionCard>
      ) : (
        <>
          {hashtags.length > 0 && (
            <SectionCard title="많이 쓰인 해시태그" description="받은 릴스의 캡션에서 많이 나온 해시태그입니다. 키워드로 쓰세요.">
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map(([h, n]) => (
                  <Tag key={h}>
                    #{h} <span className="text-fg-subtle">· {n}개</span>
                  </Tag>
                ))}
              </div>
            </SectionCard>
          )}
          <SectionCard
            title={`'${searched}' 릴스 · ${shown.length}개`}
            flush
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Select value={period} options={PERIODS} onChange={(e) => setPeriod(e.target.value)} aria-label="기간" />
                <Select value={sort} options={SORTS} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬" />
                <SaveTitlesToFormat
                  titles={shown.filter((r) => picked.has(r.code)).map((r) => ({ title: titleOf(r), views: r.plays }))}
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
              <ul className="divide-y divide-line" data-ig-list>
                {shown.map((r) => (
                  <li key={r.code} className={cn("flex items-start gap-3 px-5 py-3", picked.has(r.code) && "bg-brand-soft/40")}>
                    <input type="checkbox" checked={picked.has(r.code)} onChange={() => toggle(r.code)} className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" aria-label="고르기" />
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 인스타그램 썸네일 주소 그대로 (최적화 비용 없음)
                      <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-20 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-20 w-12 shrink-0 rounded bg-subtle" />
                    )}
                    <div className="min-w-0 flex-1">
                      <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-[13.5px] font-medium text-fg hover:text-brand">
                        {titleOf(r)} <ExternalLink className="inline size-3 text-fg-subtle" />
                      </a>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {r.author ? `@${r.author}` : "작성자 정보 없음"}
                        {r.followers != null && ` · 팔로워 ${formatNumber(r.followers)}`}
                        {r.postedAt && ` · ${formatRelative(r.postedAt)}`}
                        {r.durationSec != null && ` · ${r.durationSec}초`}
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                        <span>조회 {r.plays != null ? formatNumber(r.plays) : "-"}</span>
                        <span>좋아요 {r.likes != null ? formatNumber(r.likes) : "-"}</span>
                        <span>댓글 {r.comments != null ? formatNumber(r.comments) : "-"}</span>
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <SaveTitlesToFormat titles={[{ title: titleOf(r), views: r.plays }]} source="인스타그램 트렌드" buttonLabel="대본 포맷에 담기" variant="ghost" iconOnly />
                      <MakeMenu
                        label="영상 만들기"
                        items={[
                          { label: "YouTube 제품 홍보 영상", href: productVideoHref({ trendTitle: titleOf(r), keywords: r.hashtags.slice(0, 6) }) },
                          { label: "YouTube 정보성 영상", href: infoVideoHref({ trendTitle: titleOf(r), keywords: r.hashtags.slice(0, 6) }) },
                        ]}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-fg-subtle">
              <span>받은 릴스 {items.length}개 · 정렬·기간은 받은 결과 안에서 (추가 호출 없음)</span>
              {next ? (
                <Button size="sm" loading={loading === "more"} onClick={() => void run(true)}>
                  더 보기 (TikHub 1회)
                </Button>
              ) : (
                <span>더 불러올 릴스가 없습니다.</span>
              )}
            </div>
          </SectionCard>
          <Notice tone="neutral">릴스는 YouTube 와 같은 영상을 씁니다. [영상 만들기]로 YouTube 원고를 만든 뒤, 업로드 관리에서 Instagram 으로도 예약할 수 있습니다.</Notice>
        </>
      )}
    </div>
  );
}
