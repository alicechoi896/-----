"use client";

import Link from "next/link";
import { MakeMenu } from "@/components/shared/MakeMenu";
import { ScrapButton } from "@/components/shared/ScrapButton";
import { SaveTitlesToFormat } from "@/features/ai-learning/SaveTitlesToFormat";
import { useState } from "react";
import { ArrowUpRight, CalendarRange, Info, Lightbulb, Link2, Search, TrendingUp, X, Zap } from "lucide-react";
import { ProfileBar } from "@/features/content-profile/ProfileBar";
import { useContentProfile } from "@/features/content-profile/useContentProfile";
import { CATEGORY_OPTIONS } from "@/lib/generators/configs";
import type { Keyword, NaverRisingTopic, NaverTrendInsight, NaverTrendSection } from "@/lib/types";
import { SEASON_LABEL, seasonOf } from "@/lib/domain/naver-trend-lists";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  CopyButton,
  DataTable,
  ErrorState,
  FilterBar,
  FilterItem,
  LoadingState,
  Notice,
  SearchInput,
  SectionCard,
  SegmentedControl,
  Select,
  StatTile,
  Tag,
  TrendLineChart,
  type Column,
} from "@/components/ui";
import { formatNumber } from "@/lib/utils";

const PERIODS = [
  { value: "7", label: "7일" },
  { value: "14", label: "14일" },
  { value: "21", label: "21일" },
  { value: "30", label: "30일" },
  { value: "90", label: "3개월" },
  { value: "180", label: "6개월" },
  { value: "365", label: "1년" },
  { value: "730", label: "2년" },
  { value: "1095", label: "3년" },
];

/** 프로필이 없을 때 기본 기간 */
const DEFAULT_PERIOD = "14";

const COMPETITION = {
  low: { label: "낮음", tone: "success" },
  mid: { label: "보통", tone: "warning" },
  high: { label: "높음", tone: "danger" },
} as const;

/**
 * 네이버 트렌드 탐색 (NAVER 클립 / NAVER 블로그 공용).
 * - scope="clip": 급상승 주제 → 클립 소재 중심
 * - scope="blog": 검색어 중심, 검색 추이 차트, 관련 검색어, 콘텐츠 아이디어
 * YouTube 트렌드와는 데이터 출처(NaverTrendProvider)가 다른 별도 기능이다.
 */
export function NaverTrendExplorer({ scope }: { scope: "clip" | "blog" }) {
  const [category, setCategory] = useState("생활/주방");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  // 기간: 직접 고르기 전까지는 콘텐츠 프로필의 기본 분석기간 (프로필을 바꾸면 다시 프로필 값으로)
  const [periodOverride, setPeriodOverride] = useState<string | null>(null);
  // 콘텐츠 프로필: "무엇을 조사할지" (카테고리·관심 키워드·제외 키워드). 분석은 NAVER 방식으로 따로 한다
  const profile = useContentProfile(() => setPeriodOverride(null));
  const useProfile = Boolean(profile.selected && profile.applied);
  const profilePeriod = useProfile && profile.selected ? String(profile.selected.defaultTrendPeriod) : DEFAULT_PERIOD;
  const period = periodOverride ?? (PERIODS.some((p) => p.value === profilePeriod) ? profilePeriod : DEFAULT_PERIOD);
  const setPeriod = (v: string) => setPeriodOverride(v);

  const trendQuery: TrendQuery = {
    scope,
    category: useProfile ? undefined : category,
    keyword,
    periodDays: Number(period),
    profileId: profile.scopeParam,
  };
  const { data, loading, error, reload } = useAsync(
    () => (profile.ready ? api.trends.naver(trendQuery) : new Promise<never>(() => {})), // 프로필을 읽은 뒤 한 번만 조회한다
    [scope, category, keyword, period, profile.ready, profile.scopeParam],
  );
  const insight = data?.insight;

  /** 키워드를 누르면 검색어 칸에 넣고 바로 조회한다 */
  function searchKeyword(k: string) {
    setKeywordInput(k);
    setKeyword(k);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearKeyword() {
    setKeywordInput("");
    setKeyword("");
  }

  return (
    <div className="space-y-5">
      <ProfileBar state={profile} note="검색어를 넣으면 이 범위 안에서 좁혀 조사합니다" />
      <FilterBar
        actions={
          <Button variant="primary" icon={Search} onClick={() => setKeyword(keywordInput.trim())}>
            조회
          </Button>
        }
      >
        {!useProfile && (
          <FilterItem label="카테고리">
            <Select className="w-40" value={category} options={CATEGORY_OPTIONS} onChange={(e) => setCategory(e.target.value)} />
          </FilterItem>
        )}
        <FilterItem label="검색어">
          <SearchInput
            className="w-60"
            value={keywordInput}
            placeholder={scope === "blog" ? "예: 무선청소기" : "예: 난방비"}
            onValueChange={(v) => {
              setKeywordInput(v);
              if (!v) setKeyword("");
            }}
            onSubmit={() => setKeyword(keywordInput.trim())}
          />
        </FilterItem>
        <FilterItem label="최근 기간">
          <SegmentedControl className="flex-wrap" options={PERIODS} value={period} onChange={setPeriod} />
        </FilterItem>
      </FilterBar>

      {insight?.notes && insight.notes.length > 0 && !loading && (
        <Notice tone="neutral" icon={Info}>
          {insight.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
        </Notice>
      )}

      {loading ? (
        <SectionCard>
          <LoadingState variant="skeleton" rows={6} />
        </SectionCard>
      ) : error || !insight ? (
        <SectionCard>
          <ErrorState message={error ?? "데이터가 없습니다."} onRetry={reload} />
        </SectionCard>
      ) : scope === "clip" ? (
        <ClipView key={insight.collectedAt + keyword} insight={insight} q={trendQuery} keyword={keyword} onKeyword={searchKeyword} onClear={clearKeyword} />
      ) : (
        <BlogView key={insight.collectedAt + keyword} insight={insight} q={trendQuery} keyword={keyword} onKeyword={searchKeyword} onClear={clearKeyword} />
      )}
    </div>
  );
}

/* ───────── [더보기]: 처음 10개, 누를 때마다 서버가 10개 더 계산 ───────── */

type TrendQuery = { scope: "clip" | "blog"; category?: string; keyword?: string; periodDays: number; profileId?: string };

type KeywordHandlers = {
  q: TrendQuery;
  keyword: string;
  onKeyword: (k: string) => void;
  onClear: () => void;
};

/** 처음 받은 10개에 [더보기]로 받은 것을 이어 붙인다. 조회 조건이 바뀌면(key) 처음부터 */
function usePagedInsight(insight: NaverTrendInsight, q: TrendQuery) {
  const [risingKeywords, setRisingKeywords] = useState(insight.risingKeywords);
  const [risingTopics, setRisingTopics] = useState(insight.risingTopics);
  const [related, setRelated] = useState(insight.relatedKeywords);
  const [ideas, setIdeas] = useState(insight.contentIdeas);
  const [more, setMore] = useState(insight.more ?? { rising: false, related: false, ideas: false });
  const [loading, setLoading] = useState<NaverTrendSection | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadMore(section: NaverTrendSection) {
    setLoading(section);
    setError(null);
    try {
      const offset = section === "rising" ? risingKeywords.length : section === "related" ? related.length : ideas.length;
      const r = await api.trends.naverMore(q, section, offset);
      const add = <T,>(prev: T[], next: T[] | undefined, key: (x: T) => string) => {
        const seen = new Set(prev.map(key));
        return [...prev, ...(next ?? []).filter((x) => !seen.has(key(x)))];
      };
      if (section === "rising") {
        setRisingKeywords((prev) => add(prev, r.risingKeywords, (k) => k.text));
        setRisingTopics((prev) => add(prev, r.risingTopics, (t) => t.id));
      } else if (section === "related") setRelated((prev) => add(prev, r.relatedKeywords, (k) => k.text));
      else setIdeas((prev) => add(prev, r.contentIdeas, (x) => x));
      setMore((m) => ({ ...m, [section]: r.hasMore }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "더 불러오지 못했습니다.");
    } finally {
      setLoading(null);
    }
  }
  return { risingKeywords, risingTopics, related, ideas, more, loading, error, loadMore };
}

/** 목록 아래 [10개 더 보기] */
function MoreButton({ show, loading, onClick, error }: { show: boolean; loading: boolean; onClick: () => void; error?: string | null }) {
  if (!show && !error) return null;
  return (
    <div className="border-t border-line">
      {error && <p className="px-5 pt-2 text-center text-xs text-danger">{error}</p>}
      {show && (
        <button
          type="button"
          disabled={loading}
          onClick={onClick}
          className="w-full px-5 py-2.5 text-center text-xs font-medium text-fg-subtle hover:bg-subtle hover:text-brand disabled:opacity-60"
        >
          {loading ? "불러오는 중…" : "10개 더 보기"}
        </button>
      )}
    </div>
  );
}

/* ───────── NAVER 클립 ───────── */

function ClipView({ insight, q, keyword, onKeyword, onClear }: { insight: NaverTrendInsight } & KeywordHandlers) {
  const pg = usePagedInsight(insight, q);
  return (
    <div className="space-y-4">
      {keyword && <ActiveKeyword keyword={keyword} onClear={onClear} />}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <RisingTopicsCard
          topics={pg.risingTopics}
          onKeyword={onKeyword}
          description="클립 소재로 쓰기 좋은 주제입니다."
          makeHref={(t) => `/naver-clip/info-content?${clipParams(t, insight)}`}
          makeChoices={(t) => [
            { label: "제품 홍보 클립 만들기", href: `/naver-clip/product-content?${clipParams(t, insight)}` },
            { label: "정보성 클립 만들기", href: `/naver-clip/info-content?${clipParams(t, insight)}` },
          ]}
          makeLabel="클립 만들기"
          more={<MoreButton show={pg.more.rising} loading={pg.loading === "rising"} onClick={() => void pg.loadMore("rising")} error={pg.error} />}
        />

        <div className="space-y-4">
          <SectionCard title={`급상승 키워드 · ${pg.risingKeywords.length}개`} icon={TrendingUp} description="키워드를 누르면 그 키워드로 조회합니다." flush>
            <KeywordTable keywords={pg.risingKeywords} onKeyword={onKeyword} />
            <MoreButton show={pg.more.rising} loading={pg.loading === "rising"} onClick={() => void pg.loadMore("rising")} />
          </SectionCard>
          {/* 시즌 키워드는 검색어와 무관한 지표라 검색어가 없을 때만 보여준다 */}
          {!keyword && <KeywordChips title={`시즌 키워드 · 지금(${SEASON_LABEL[seasonOf()]})`} icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth onKeyword={onKeyword} copyAll />}
          <KeywordChips
            title={`관련 키워드 · ${pg.related.length}개`}
            icon={Link2}
            keywords={pg.related}
            onKeyword={onKeyword}
            copyAll
            more={pg.more.related ? <MoreButton show loading={pg.loading === "related"} onClick={() => void pg.loadMore("related")} /> : undefined}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────── NAVER 블로그 ───────── */

/**
 * 검색어가 없을 때: 프로필(또는 카테고리) 전체의 검색 추이·관련 검색어·급상승·시즌 키워드·아이디어. 키워드를 누르면 바로 조회한다.
 * 검색어가 있을 때: 그 검색어의 검색 추이·관련 검색어·글 아이디어가 중심.
 *   급상승·시즌 키워드는 검색어와 무관한 카테고리 지표라서 아래 "다른 키워드 둘러보기" 로 작게 내린다.
 */
function BlogView({ insight, q, keyword, onKeyword, onClear }: { insight: NaverTrendInsight } & KeywordHandlers) {
  const pg = usePagedInsight(insight, q);
  const ideas = (
    <SectionCard
      title={`${keyword ? `'${keyword}' 글 아이디어` : "콘텐츠 아이디어"} · ${pg.ideas.length}개`}
      icon={Lightbulb}
      actions={
        pg.ideas.length > 0 && (
          <div className="flex items-center gap-1.5">
            <SaveTitlesToFormat titles={pg.ideas.map((t) => ({ title: t, views: null }))} source="NAVER 트렌드 콘텐츠 아이디어" buttonLabel="전체 대본 포맷에 담기" variant="ghost" iconOnly />
            <CopyButton value={pg.ideas} label="전체 복사" />
          </div>
        )
      }
      flush
    >
      <ul className="divide-y divide-line">
        {pg.ideas.map((idea) => (
          <li key={idea} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-sm text-fg">{idea}</span>
            <span className="flex shrink-0 items-center gap-1">
            <SaveTitlesToFormat titles={[{ title: idea, views: null }]} source="NAVER 트렌드 콘텐츠 아이디어" buttonLabel="대본 포맷에 담기" variant="ghost" iconOnly />
            <Link
              href={`/naver-blog/info-writing?${new URLSearchParams({ topic: idea, ...(keyword ? { mainKeyword: keyword } : {}) }).toString()}`}
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle hover:text-brand"
            >
              글쓰기
              <ArrowUpRight className="size-3.5" />
            </Link>
            </span>
          </li>
        ))}
      </ul>
      <MoreButton show={pg.more.ideas} loading={pg.loading === "ideas"} onClick={() => void pg.loadMore("ideas")} error={pg.loading === null ? pg.error : null} />
    </SectionCard>
  );

  const relatedCard = (
    <SectionCard
      title={`관련 검색어 · ${pg.related.length}개`}
      icon={Link2}
      description={keyword ? "누르면 그 검색어로 다시 조회합니다." : "누르면 그 검색어로 조회합니다."}
      actions={pg.related.length > 0 && <CopyButton value={pg.related.map((k) => k.text)} label="전체 복사" />}
      flush
    >
      <KeywordTable keywords={pg.related} showGrowth={false} onKeyword={onKeyword} />
      <MoreButton show={pg.more.related} loading={pg.loading === "related"} onClick={() => void pg.loadMore("related")} />
    </SectionCard>
  );

  if (!keyword) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-card border border-dashed border-line-strong bg-subtle/60 px-5 py-3">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <p className="text-[13px] text-fg-muted">지금은 현재 분석 기준 전체를 보여줍니다. 검색어를 넣거나 키워드를 누르면 그 키워드로 좁혀 조회합니다.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <SectionCard
            title={`최근 검색 추이 · ${insight.searchTrendLabel ?? "전체"}`}
            icon={TrendingUp}
            description="관심 키워드를 한 묶음으로 본 상대 지수입니다 (기간 내 최대값 = 100)."
          >
            {insight.searchTrend.length ? <TrendLineChart data={insight.searchTrend} /> : <EmptyNote text="검색 추이 데이터를 받지 못했습니다." />}
          </SectionCard>
          {relatedCard}
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <RisingTopicsCard
            topics={pg.risingTopics}
            onKeyword={onKeyword}
            description="현재 분석 기준에서 검색이 늘고 있는 주제입니다."
            makeHref={(t) => `/naver-blog/info-writing?${new URLSearchParams({ topic: t.title }).toString()}`}
            makeLabel="글쓰기"
            compact
            more={<MoreButton show={pg.more.rising} loading={pg.loading === "rising"} onClick={() => void pg.loadMore("rising")} />}
          />
          <KeywordChips title={`시즌 키워드 · 지금(${SEASON_LABEL[seasonOf()]})`} icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth onKeyword={onKeyword} copyAll />
          {ideas}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActiveKeyword keyword={keyword} onClear={onClear} />
      {insight.keywordStats && <KeywordStatsRow stats={insight.keywordStats} />}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard title={`최근 검색 추이 · ${keyword}`} icon={TrendingUp} description="기간 내 최대값을 100으로 둔 상대 지수입니다.">
          <TrendLineChart data={insight.searchTrend} />
        </SectionCard>
        {relatedCard}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
        {ideas}
        <SectionCard title="다른 키워드 둘러보기" icon={Zap} description="검색어와 별개로, 현재 분석 기준(프로필·카테고리)에서 요즘 뜨는 키워드입니다.">
          <p className="mb-1.5 text-[11.5px] font-medium text-fg-subtle">급상승</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.risingKeywords.slice(0, 8).map((k) => (
              <KeywordButton key={k.text} text={k.text} onClick={onKeyword} />
            ))}
          </div>
          <p className="mt-3 mb-1.5 text-[11.5px] font-medium text-fg-subtle">시즌</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.seasonalKeywords.slice(0, 8).map((k) => (
              <KeywordButton key={k.text} text={k.text} onClick={onKeyword} />
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/* ───────── 공용 조각 ───────── */

/** 클립 생성 화면으로 넘길 값: 트렌드(표시 = 주제 제목)·주제·키워드·카테고리 */
function clipParams(t: NaverRisingTopic, insight: NaverTrendInsight): string {
  const keywords = (t.keywords.length ? t.keywords : [t.title]).slice(0, 6).join(", ");
  return new URLSearchParams({
    trendId: t.id,
    trendTitle: t.title,
    keywords,
    category: insight.query.category ?? insight.query.profileScope?.mainCategory ?? t.category ?? "",
  }).toString();
}

function RisingTopicsCard({
  topics,
  onKeyword,
  description,
  makeHref,
  makeLabel,
  makeChoices,
  compact,
  more,
}: {
  topics: NaverRisingTopic[];
  onKeyword: (k: string) => void;
  description: string;
  makeHref: (t: NaverRisingTopic) => string;
  makeLabel: string;
  /** 있으면 [만들기]를 눌러 고르는 메뉴 (예: 제품 홍보 클립 / 정보성 클립) */
  makeChoices?: (t: NaverRisingTopic) => { label: string; href: string }[];
  compact?: boolean;
  /** 목록 아래 [10개 더 보기] */
  more?: React.ReactNode;
}) {
  return (
    <SectionCard
      title={`급상승 주제 · ${topics.length}개`}
      icon={Zap}
      description={description}
      actions={
        topics.length > 0 && (
          <div className="flex items-center gap-1.5">
            <SaveTitlesToFormat titles={topics.map((t) => ({ title: t.title, views: null }))} source="NAVER 트렌드 급상승 주제" buttonLabel="전체 대본 포맷에 담기" variant="ghost" iconOnly />
            <CopyButton value={topics.map((t) => t.title)} label="전체 복사" />
          </div>
        )
      }
      flush
    >
      {topics.length === 0 && <EmptyNote text="급상승 주제를 찾지 못했습니다. 위쪽 안내 문구를 확인하거나 다른 검색어로 조회해 보세요." />}
          <ul className="divide-y divide-line">
            {topics.map((t) => (
              <li key={t.id} className={compact ? "flex items-center justify-between gap-3 px-5 py-2.5" : "flex items-start justify-between gap-4 px-5 py-4"}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onKeyword(t.title)} className="truncate text-left font-medium text-fg hover:text-brand" title={`'${t.title}' 로 조회`}>
                      {t.title}
                    </button>
                    <Badge tone="danger">+{t.growthRate}%</Badge>
                  </div>
                  {!compact && <p className="mt-1 text-[13px] text-fg-subtle">{t.description}</p>}
                  {!compact && t.keywords.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.keywords.map((k) => (
                        <KeywordButton key={k} text={k} onClick={onKeyword} />
                      ))}
                    </div>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <ScrapButton item={{ source: "naver", itemId: t.id, title: t.title, url: `https://search.naver.com/search.naver?query=${encodeURIComponent(t.title)}`, keywords: t.keywords, meta: { growthRate: t.growthRate, description: t.description, category: t.category } }} />
                  <SaveTitlesToFormat titles={[{ title: t.title, views: null }]} source="NAVER 트렌드 급상승 주제" buttonLabel="대본 포맷에 담기" variant="ghost" iconOnly />
                  {makeChoices ? (
                    <MakeMenu label={makeLabel} items={makeChoices(t)} />
                  ) : (
                    <Link href={makeHref(t)} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle hover:text-brand">
                      {makeLabel}
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
      {more}
    </SectionCard>
  );
}

function ActiveKeyword({ keyword, onClear }: { keyword: string; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-fg-muted">
      검색어
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-brand px-3 font-medium text-white">
        {keyword}
        <button type="button" onClick={onClear} aria-label="검색어 지우기" className="-mr-1 rounded-full p-0.5 hover:bg-white/20">
          <X className="size-3.5" />
        </button>
      </span>
      <span className="text-xs text-fg-subtle">로 조회한 결과입니다.</span>
    </div>
  );
}

/** 검색어 지표: 월간 검색량(검색광고 API), 경쟁, 블로그 누적 문서 수(검색 API) */
function KeywordStatsRow({ stats }: { stats: NonNullable<NaverTrendInsight["keywordStats"]> }) {
  const total = stats.monthlyPc != null && stats.monthlyMobile != null ? stats.monthlyPc + stats.monthlyMobile : null;
  const ratio = total && stats.blogDocCount != null ? stats.blogDocCount / Math.max(total, 1) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="월간 검색량"
        value={total != null ? formatNumber(total) : "-"}
        unit={total != null ? "회" : undefined}
        hint={total != null ? `PC ${formatNumber(stats.monthlyPc ?? 0)} · 모바일 ${formatNumber(stats.monthlyMobile ?? 0)}` : "검색광고 API 연결 필요"}
      />
      <StatTile label="광고 경쟁" value={stats.competition ? COMPETITION[stats.competition].label : "-"} hint="검색광고 기준" />
      <StatTile
        label="블로그 문서 수 (누적)"
        value={stats.blogDocCount != null ? formatNumber(stats.blogDocCount) : "-"}
        unit={stats.blogDocCount != null ? "건" : undefined}
        hint="발행량 지표 · 많을수록 경쟁이 셉니다"
      />
      <StatTile
        label="검색량 대비 문서 수"
        value={ratio != null ? ratio.toFixed(1) : "-"}
        unit={ratio != null ? "배" : undefined}
        hint={ratio != null ? (ratio < 1 ? "문서가 적은 편 → 노출 기회" : ratio < 5 ? "보통" : "포화 → 세부 키워드 추천") : "검색량·문서 수가 모두 있을 때 계산"}
      />
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="px-5 py-6 text-center text-[13px] text-fg-subtle">{text}</p>;
}

function KeywordButton({ text, onClick }: { text: string; onClick: (k: string) => void }) {
  return (
    <button type="button" onClick={() => onClick(text)} title={`'${text}' 로 조회`}>
      <Tag className="hover:border-brand-line hover:bg-brand-soft hover:text-brand">{text}</Tag>
    </button>
  );
}

function KeywordTable({
  keywords,
  showGrowth = true,
  compact,
  onKeyword,
}: {
  keywords: Keyword[];
  showGrowth?: boolean;
  compact?: boolean;
  onKeyword?: (k: string) => void;
}) {
  const columns: Column<Keyword>[] = [
    {
      key: "text",
      header: "키워드",
      render: (k) => <span className={onKeyword ? "font-medium hover:text-brand" : "font-medium"}>{k.text}</span>,
    },
    {
      key: "volume",
      header: "월간 검색량",
      numeric: true,
      render: (k) => (k.volume ? formatNumber(k.volume) : "-"),
    },
    ...(showGrowth
      ? [
          {
            key: "growth",
            header: "증가율",
            numeric: true,
            render: (k: Keyword) => <span className="text-danger">+{k.growthRate}%</span>,
          },
        ]
      : []),
    ...(!compact
      ? [
          {
            key: "competition",
            header: "경쟁",
            align: "center" as const,
            render: (k: Keyword) =>
              k.competition ? <Badge tone={COMPETITION[k.competition].tone}>{COMPETITION[k.competition].label}</Badge> : "-",
          },
        ]
      : []),
  ];
  return (
    <DataTable
      dense
      columns={columns}
      rows={keywords}
      rowKey={(k) => k.text}
      onRowClick={onKeyword ? (k) => onKeyword(k.text) : undefined}
      empty={<EmptyNote text="표시할 키워드가 없습니다. 위쪽 안내 문구를 확인해 주세요." />}
    />
  );
}

function KeywordChips({
  title,
  icon,
  keywords,
  showGrowth,
  onKeyword,
  copyAll,
  more,
}: {
  title: string;
  icon: typeof Zap;
  keywords: Keyword[];
  showGrowth?: boolean;
  onKeyword?: (k: string) => void;
  /** 오른쪽 위에 [전체 복사] (키워드를 줄마다 하나씩) */
  copyAll?: boolean;
  /** 아래 [10개 더 보기] */
  more?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} icon={icon} actions={copyAll && keywords.length > 0 && <CopyButton value={keywords.map((k) => k.text)} label="전체 복사" />}>
      {keywords.length === 0 && <p className="text-[13px] text-fg-subtle">표시할 키워드가 없습니다.</p>}
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((k) => {
          const tag = (
            <Tag className={onKeyword ? "hover:border-brand-line hover:bg-brand-soft hover:text-brand" : undefined}>
              {k.text}
              {showGrowth && k.growthRate != null && <span className="ml-1.5 text-danger">+{k.growthRate}%</span>}
            </Tag>
          );
          return onKeyword ? (
            <button key={k.text} type="button" onClick={() => onKeyword(k.text)} title={`'${k.text}' 로 조회`}>
              {tag}
            </button>
          ) : (
            <span key={k.text}>{tag}</span>
          );
        })}
      </div>
      {more && <div className="-mx-5 -mb-5 mt-4">{more}</div>}
    </SectionCard>
  );
}
