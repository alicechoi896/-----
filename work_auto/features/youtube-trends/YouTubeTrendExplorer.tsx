"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Flame, Info, PanelRightOpen, Star, TrendingUp } from "lucide-react";
import { trendScoreLevel } from "@/lib/domain/trend-score";
import { countryLabel, dateRange, defaultYouTubeQuery, refreshRecentRange } from "@/lib/domain/youtube";
import type { ContentProfile, SavedFilter, SavedTrend, YouTubeTrendItem } from "@/lib/types";
import { ProfileBar } from "@/features/content-profile/ProfileBar";
import { pickProfile, useContentProfile } from "@/features/content-profile/useContentProfile";
import { api } from "@/lib/api-client";
import { Badge, Button, CopyButton, DataTable, EmptyState, ErrorState, LoadingState, Notice, SectionCard, Tag, type Column } from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { cn, formatCompact, formatDate, formatNumber } from "@/lib/utils";
import { TrendFilterPanel, type TrendDraft } from "./TrendFilterPanel";
import { TrendInsights } from "./TrendInsights";
import { FormatBadge, VideoDetailDrawer } from "./VideoDetailDrawer";
import { infoVideoHref, trendPrefill } from "./trend-links";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
/** 처음 검색할 때 조건에 맞는 영상이 이보다 적으면 다음 페이지를 자동으로 더 불러온다 */

/**
 * YouTube 트렌드 찾기.
 *
 * - 조건 → GET /api/trends/youtube (한 번에 최대 50개 조회) → [더 불러오기] 로 다음 50개를 이어 붙인다.
 * - 구독자·조회수·댓글 조건은 YouTube 검색 API 가 지원하지 않아 받아온 50개 중에서 거른다.
 * - 저장한 조건·찜은 DB 에 저장된다. 기본 조건은 화면을 열 때 자동 적용되고, 생성 화면 "참고 트렌드" 기준이 된다.
 */
export function YouTubeTrendExplorer() {
  const [draft, setDraft] = useState<TrendDraft>(() => defaultYouTubeQuery());
  const [applied, setApplied] = useState<TrendDraft | null>(null);
  const [items, setItems] = useState<YouTubeTrendItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [fetched, setFetched] = useState(0);
  const [provider, setProvider] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState("");
  const [saved, setSaved] = useState<SavedTrend[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<YouTubeTrendItem | null>(null);

  const requestId = useRef(0);
  /** 이번 검색에 적용할 콘텐츠 프로필 ("none" = 적용 안 함) */
  const profileIdRef = useRef("");
  // 프로필 전환 콜백에서 최신 검색 조건을 읽기 위한 참조
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  const runSearch = useCallback(async (draftQuery: TrendDraft) => {
    const id = ++requestId.current;
    const query = { ...draftQuery, profileId: profileIdRef.current || undefined };
    setApplied(query);
    setLoading(true);
    setError(null);
    setMoreError(null);
    try {
      // 제목 언어·구독자·조회수 조건으로 걸러져 남는 영상이 적으면 서버가 다음 페이지를 이어서 받는다 (요청 1번, 최대 3페이지)
      const page = await api.trends.youtube(query, { fill: true });
      const items = page.items;
      const fetchedCount = page.fetched;
      if (id !== requestId.current) return;
      setItems(items);
      setNextPageToken(page.nextPageToken);
      setFetched(fetchedCount);
      setProvider(page.provider);
    } catch (e) {
      if (id !== requestId.current) return;
      setItems([]);
      setNextPageToken(null);
      setFetched(0);
      setError(errorText(e, "트렌드를 불러오지 못했습니다."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // 콘텐츠 프로필: 바꾸면 그 프로필의 국가·분석기간으로 다시 검색, 적용을 끄고 켜면 같은 조건으로 다시 검색
  const onProfileChange = useCallback(
    (p: ContentProfile | null, scopeParam: string) => {
      profileIdRef.current = scopeParam;
      setActiveFilterId("");
      const next = p && scopeParam !== "none" ? withProfileDefaults(draftRef.current, p) : draftRef.current;
      setDraft(next);
      void runSearch(next);
    },
    [runSearch],
  );
  const profile = useContentProfile(onProfileChange);

  // 처음 열 때: 저장한 조건·찜·콘텐츠 프로필을 읽는다.
  // 검색 조건 = 기본 저장 조건 → 없으면 콘텐츠 프로필의 국가·분석기간 → 없으면 기본값 (한국, 최근 7일)
  // 기간은 기본 저장 조건이 있어도 콘텐츠 프로필의 기본 분석기간을 쓴다 (프로필이 기간의 기준)
  useEffect(() => {
    let active = true;
    Promise.all([
      api.trends.filters.list().catch(() => [] as SavedFilter[]),
      api.trends.saved.list().catch(() => [] as SavedTrend[]),
      api.profiles.list().catch(() => [] as ContentProfile[]),
    ]).then(
      ([filterList, savedList, profileList]) => {
        if (!active) return;
        setFilters(filterList);
        setSaved(savedList);
        const startProfile = pickProfile(profileList);
        profileIdRef.current = startProfile?.id ?? "none";
        const def = filterList.find((f) => f.isDefault);
        const query = def
          ? startProfile
            ? withProfilePeriod(fromSaved(def), startProfile)
            : fromSaved(def)
          : startProfile
            ? withProfileDefaults(defaultYouTubeQuery(), startProfile)
            : defaultYouTubeQuery();
        setDraft(query);
        setActiveFilterId(def?.id ?? "");
        void runSearch(query);
      },
    );
    return () => {
      active = false;
    };
  }, [runSearch]);

  async function loadMore() {
    if (!applied || !nextPageToken) return;
    setLoadingMore(true);
    setMoreError(null);
    const id = requestId.current;
    try {
      const page = await api.trends.youtube({ ...applied, pageToken: nextPageToken });
      if (id !== requestId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setNextPageToken(page.nextPageToken);
      setFetched((n) => n + page.fetched);
    } catch (e) {
      setMoreError(errorText(e, "더 불러오지 못했습니다."));
    } finally {
      setLoadingMore(false);
    }
  }

  function searchKeyword(keyword: string) {
    const next = { ...draft, keyword };
    setDraft(next);
    setActiveFilterId("");
    setDetail(null);
    void runSearch(next);
  }

  /* ───────── 저장한 조건 ───────── */

  function pickFilter(id: string) {
    setActiveFilterId(id);
    const f = filters.find((x) => x.id === id);
    if (!f) return;
    const query = fromSaved(f);
    setDraft(query);
    void runSearch(query);
  }

  async function saveFilter(name: string, isDefault: boolean) {
    try {
      const savedFilter = await api.trends.filters.save({ name, params: draft, isDefault });
      setFilters((prev) => [
        savedFilter,
        ...prev.filter((f) => f.id !== savedFilter.id).map((f) => (isDefault ? { ...f, isDefault: false } : f)),
      ]);
      setActiveFilterId(savedFilter.id);
      setNotice(isDefault ? `'${name}' 조건을 저장하고 기본 조건으로 지정했습니다.` : `'${name}' 조건을 저장했습니다.`);
    } catch (e) {
      setNotice(errorText(e, "조건을 저장하지 못했습니다."));
      throw e;
    }
  }

  async function makeDefault(id: string) {
    try {
      await api.trends.filters.update(id, { isDefault: true });
      setFilters((prev) => prev.map((f) => ({ ...f, isDefault: f.id === id })));
      setNotice("기본 조건으로 지정했습니다. 다음에 화면을 열 때 자동으로 적용됩니다.");
    } catch (e) {
      setNotice(errorText(e, "기본 조건으로 지정하지 못했습니다."));
    }
  }

  async function deleteFilter(id: string) {
    const f = filters.find((x) => x.id === id);
    if (!f || !window.confirm(`'${f.name}' 조건을 삭제할까요?`)) return;
    try {
      await api.trends.filters.remove(id);
      setFilters((prev) => prev.filter((x) => x.id !== id));
      setActiveFilterId("");
    } catch (e) {
      setNotice(errorText(e, "조건을 삭제하지 못했습니다."));
    }
  }

  /* ───────── 찜 ───────── */

  const savedByVideo = useMemo(() => new Map(saved.map((s) => [s.videoId, s])), [saved]);

  async function toggleSave(item: YouTubeTrendItem) {
    const existing = savedByVideo.get(item.videoId);
    try {
      if (existing) {
        setSaved((prev) => prev.filter((s) => s.id !== existing.id));
        await api.trends.saved.remove(existing.id);
      } else {
        const created = await api.trends.saved.add(item);
        setSaved((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      }
    } catch (e) {
      setNotice(errorText(e, "찜을 저장하지 못했습니다."));
      setSaved(await api.trends.saved.list().catch(() => saved));
    }
  }

  /* ───────── 표 ───────── */

  const columns: Column<YouTubeTrendItem>[] = [
    {
      key: "save",
      header: <Star className="size-3.5" aria-label="찜" />,
      width: "44px",
      render: (r) => {
        const on = savedByVideo.has(r.videoId);
        return (
          <button
            type="button"
            aria-label={on ? "찜 해제" : "찜하기"}
            title={on ? "찜 해제" : "찜하기 (생성 화면 참고 트렌드에 먼저 나옵니다)"}
            onClick={(e) => {
              e.stopPropagation();
              void toggleSave(r);
            }}
            className="inline-flex size-7 items-center justify-center rounded-control hover:bg-muted"
          >
            <Star className={cn("size-4", on ? "fill-warning text-warning" : "text-fg-subtle")} />
          </button>
        );
      },
    },
    {
      key: "thumb",
      header: "썸네일",
      width: "100px",
      render: (r) => (
        <VideoThumb className="h-[46px] w-[82px]" thumbnailUrl={r.thumbnailUrl} color={r.thumbnailColor} durationSec={r.durationSec} shorts={r.format === "shorts"} />
      ),
    },
    {
      key: "title",
      header: "제목",
      render: (r) => (
        <div className="min-w-[220px]">
          <p className="line-clamp-2 font-medium text-fg">{r.title}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <FormatBadge format={r.format} />
            <span className="truncate text-xs text-fg-subtle">{r.category}</span>
          </div>
        </div>
      ),
    },
    { key: "trendScore", header: "Trend Score", width: "120px", sortValue: (r) => r.trendScore, render: (r) => <TrendScore score={r.trendScore} /> },
    {
      key: "channel",
      header: "채널",
      sortValue: (r) => r.channelSubscribers,
      render: (r) => (
        <div className="max-w-[140px]">
          <p className="truncate text-fg-muted">{r.channelName}</p>
          <p className="tabular text-xs text-fg-subtle">구독자 {formatCompact(r.channelSubscribers)}</p>
        </div>
      ),
    },
    {
      key: "publishedAt",
      header: "게시일",
      sortValue: (r) => r.publishedAt,
      render: (r) => <span className="tabular whitespace-nowrap text-fg-muted">{formatDate(r.publishedAt)}</span>,
    },
    { key: "views", header: "조회수", numeric: true, sortValue: (r) => r.views, render: (r) => formatNumber(r.views) },
    {
      key: "viewsPerDay",
      header: "일평균 조회수",
      numeric: true,
      sortValue: (r) => r.viewsPerDay,
      render: (r) => <span className="font-medium">{formatNumber(r.viewsPerDay)}</span>,
    },
    {
      key: "comments",
      header: "댓글",
      numeric: true,
      sortValue: (r) => r.commentCount ?? -1,
      render: (r) => <span className="text-fg-muted">{r.commentCount == null ? "-" : formatCompact(r.commentCount)}</span>,
    },
    { key: "tags", header: "키워드 · 태그", render: (r) => <KeywordTags item={r} /> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            title="상세 · AI 분석"
            aria-label="상세 · AI 분석"
            onClick={() => setDetail(r)}
            className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-brand"
          >
            <PanelRightOpen className="size-4" />
          </button>
          <Link
            href={infoVideoHref(trendPrefill(r, savedByVideo.get(r.videoId)?.analysis))}
            aria-label="이 트렌드로 정보성 영상 만들기"
            title="이 트렌드로 정보성 영상 만들기"
            className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-brand"
          >
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      ),
    },
  ];

  const isMock = provider.startsWith("mock");
  const summary = applied
    ? `${countryLabel(applied.country)} · ${applied.recentDays ? `최근 ${applied.recentDays}일` : `${applied.publishedFrom} ~ ${applied.publishedTo ?? "오늘"}`}${applied.keyword ? ` · "${applied.keyword}"` : ""}`
    : "";

  return (
    <div className="space-y-5">
      <ProfileBar state={profile} note="검색어를 넣으면 이 범위 안에서 좁혀 찾습니다" />

      <TrendFilterPanel
        draft={draft}
        resetQuery={() => (profile.selected && profile.applied ? withProfileDefaults(defaultYouTubeQuery(), profile.selected) : defaultYouTubeQuery())}
        onChange={setDraft}
        onSearch={() => {
          setActiveFilterId("");
          void runSearch(draft);
        }}
        filters={filters}
        activeFilterId={activeFilterId}
        onPickFilter={pickFilter}
        onSaveFilter={saveFilter}
        onMakeDefault={(id) => void makeDefault(id)}
        onDeleteFilter={(id) => void deleteFilter(id)}
        searching={loading}
      />

      {notice && (
        <Notice tone="neutral" icon={Info} className="items-center">
          <span className="flex items-center justify-between gap-3">
            {notice}
            <button type="button" className="text-xs text-fg-subtle hover:text-fg" onClick={() => setNotice(null)}>
              닫기
            </button>
          </span>
        </Notice>
      )}
      {isMock && (
        <Notice tone="info" icon={Info}>
          지금은 데모(Mock) 데이터입니다. 설정 → API 연결 센터에서 YouTube Data API 키를 연결하면 실제 영상으로 조회합니다.
        </Notice>
      )}

      <TrendInsights items={items} activeKeyword={applied?.keyword} onKeywordClick={searchKeyword} />

      <SectionCard
        title={
          <span className="flex items-center gap-2">
            트렌드 영상
            {!loading && <Badge tone="brand">{items.length}개</Badge>}
            {saved.length > 0 && (
              <Badge tone="warning">
                <Star className="size-3 fill-current" />찜 {saved.length}
              </Badge>
            )}
          </span>
        }
        icon={TrendingUp}
        description={`${summary}${summary ? " — " : ""}Trend Score = 조회 속도 50% + 구독자 대비 조회 비율 30% + 최근성 20%. 열 제목을 누르면 정렬합니다.`}
        flush
        actions={
          !loading && nextPageToken ? (
            <Button size="sm" icon={ChevronDown} loading={loadingMore} onClick={() => void loadMore()}>
              50개 더 불러오기
            </Button>
          ) : undefined
        }
        footer={
          !loading && !error && items.length + fetched > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-fg-subtle">
                조회한 영상 {formatNumber(fetched)}개 중 조건에 맞는 영상 {formatNumber(items.length)}개
                {!isMock && " · 50개를 더 불러올 때마다 YouTube API 할당량 약 102 units (하루 기본 10,000)"}
              </p>
              <div className="flex items-center gap-2">
                {moreError && <span className="text-xs text-danger">{moreError}</span>}
                {nextPageToken ? (
                  <Button size="sm" icon={ChevronDown} loading={loadingMore} onClick={() => void loadMore()}>
                    50개 더 불러오기
                  </Button>
                ) : (
                  <span className="text-xs text-fg-subtle">더 불러올 영상이 없습니다.</span>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <LoadingState variant="skeleton" rows={6} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => applied && void runSearch(applied)} />
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            onRowClick={setDetail}
            defaultSort={{ key: "trendScore", dir: "desc" }}
            empty={
              <EmptyState
                title="조건에 맞는 영상이 없습니다"
                description={
                  fetched > 0
                    ? `조회한 ${fetched}개가 구독자·조회수·댓글 조건에 맞지 않았습니다. [50개 더 불러오기] 를 누르거나 조건을 넓혀 보세요.`
                    : "게시일 범위를 늘리거나 카테고리·키워드 조건을 바꿔 보세요."
                }
              />
            }
          />
        )}
      </SectionCard>

      <VideoDetailDrawer
        item={detail}
        saved={detail ? savedByVideo.has(detail.videoId) : false}
        savedAnalysis={detail ? savedByVideo.get(detail.videoId)?.analysis : null}
        onClose={() => setDetail(null)}
        onToggleSave={(item) => void toggleSave(item)}
        onKeywordClick={searchKeyword}
      />
    </div>
  );
}

/**
 * 저장한 조건 → 검색 조건. "최근 N일" 로 저장한 조건은 오늘 기준으로 다시 계산한다.
 * 저장할 때 비워 둔 범위(구독자·조회수)는 기본값으로 채우지 않는다 (저장한 그대로).
 */
function fromSaved(f: SavedFilter): TrendDraft {
  const { country, format, publishedFrom, publishedTo } = defaultYouTubeQuery();
  const base: TrendDraft = { country, format, publishedFrom, publishedTo };
  return refreshRecentRange({ ...base, ...f.params });
}

/** 콘텐츠 프로필의 기본 분석기간만 넣는다 (기본 저장 조건의 나머지는 유지) */
function withProfilePeriod(q: TrendDraft, p: ContentProfile): TrendDraft {
  return { ...q, recentDays: p.defaultTrendPeriod, ...dateRange(p.defaultTrendPeriod) };
}

/** 콘텐츠 프로필의 국가·기본 분석기간을 검색 조건에 넣는다 (나머지 조건은 유지) */
function withProfileDefaults(q: TrendDraft, p: ContentProfile): TrendDraft {
  return { ...q, country: p.country, recentDays: p.defaultTrendPeriod, ...dateRange(p.defaultTrendPeriod) };
}

function KeywordTags({ item }: { item: YouTubeTrendItem }) {
  // 주요 키워드 → 나머지 태그 순서로 한 줄에 보여주고, 전체는 마우스를 올리거나 상세 패널에서 본다
  const extra = item.tags.filter((t) => !item.keywords.includes(t));
  const all = [...item.keywords, ...extra];
  const shown = [...item.keywords.slice(0, 2).map((text) => ({ text, tag: false })), ...extra.slice(0, 1).map((text) => ({ text, tag: true }))];
  return (
    <div className="flex w-[250px] items-center gap-1" title={all.join(", ")}>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      {shown.map((k) =>
        k.tag ? (
          <span key={k.text} className="inline-block h-6 max-w-[80px] truncate rounded-md px-1.5 text-xs leading-6 text-fg-subtle ring-1 ring-line ring-inset">
            #{k.text}
          </span>
        ) : (
          <Tag key={k.text} className="max-w-[80px] shrink-0">
            <span className="truncate">{k.text}</span>
          </Tag>
        ),
      )}
      {all.length > shown.length && <span className="shrink-0 text-xs text-fg-subtle">+{all.length - shown.length}</span>}
      </div>
      {all.length > 0 && (
        // 행 클릭(상세 열기)과 겹치지 않게 막는다
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <CopyButton value={all.join(", ")} label="키워드·태그 복사" iconOnly className="px-1.5" />
        </span>
      )}
    </div>
  );
}

function TrendScore({ score }: { score: number }) {
  const level = trendScoreLevel(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <div
          className={level === "hot" ? "h-full bg-danger" : level === "rising" ? "h-full bg-warning" : "h-full bg-fg-subtle"}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="tabular w-6 text-right font-semibold text-fg">{score}</span>
      {level === "hot" && (
        <Badge tone="danger" className="px-1.5">
          <Flame className="size-3" />
        </Badge>
      )}
    </div>
  );
}
