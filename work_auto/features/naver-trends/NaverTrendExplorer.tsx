"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarRange, Info, Lightbulb, Link2, Search, TrendingUp, X, Zap } from "lucide-react";
import { ProfileBar } from "@/features/content-profile/ProfileBar";
import { useContentProfile } from "@/features/content-profile/useContentProfile";
import { CATEGORY_OPTIONS } from "@/lib/generators/configs";
import type { Keyword, NaverTrendInsight } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
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
  { value: "30", label: "30일" },
  { value: "90", label: "3개월" },
  { value: "180", label: "6개월" },
  { value: "365", label: "1년" },
  { value: "730", label: "2년" },
  { value: "1095", label: "3년" },
];

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
  const [period, setPeriod] = useState("14");
  // 콘텐츠 프로필: "무엇을 조사할지" (카테고리·관심 키워드·제외 키워드). 분석은 NAVER 방식으로 따로 한다
  const profile = useContentProfile();
  const useProfile = Boolean(profile.selected && profile.applied);

  const { data, loading, error, reload } = useAsync(
    () =>
      profile.ready
        ? api.trends.naver({
            scope,
            category: useProfile ? undefined : category,
            keyword,
            periodDays: Number(period),
            profileId: profile.scopeParam,
          })
        : new Promise<never>(() => {}), // 프로필을 읽은 뒤 한 번만 조회한다
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
        <ClipView insight={insight} keyword={keyword} onKeyword={searchKeyword} onClear={clearKeyword} />
      ) : (
        <BlogView insight={insight} keyword={keyword} onKeyword={searchKeyword} onClear={clearKeyword} />
      )}
    </div>
  );
}

/* ───────── NAVER 클립 ───────── */

type KeywordHandlers = {
  keyword: string;
  onKeyword: (k: string) => void;
  onClear: () => void;
};

function ClipView({ insight, keyword, onKeyword, onClear }: { insight: NaverTrendInsight } & KeywordHandlers) {
  return (
    <div className="space-y-4">
      {keyword && <ActiveKeyword keyword={keyword} onClear={onClear} />}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="급상승 주제" icon={Zap} description="클립 소재로 쓰기 좋은 주제입니다." flush>
          {insight.risingTopics.length === 0 && <EmptyNote text="급상승 주제를 찾지 못했습니다. 위쪽 안내 문구를 확인하거나 다른 검색어로 조회해 보세요." />}
          <ul className="divide-y divide-line">
            {insight.risingTopics.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-fg">{t.title}</p>
                    <Badge tone="danger">+{t.growthRate}%</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-fg-subtle">{t.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.keywords.map((k) => (
                      <KeywordButton key={k} text={k} onClick={onKeyword} />
                    ))}
                  </div>
                </div>
                <Link
                  href={`/naver-clip/info-content?trendId=${t.id}`}
                  className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle hover:text-brand"
                >
                  클립 만들기
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="급상승 키워드" icon={TrendingUp} description="키워드를 누르면 그 키워드로 조회합니다." flush>
            <KeywordTable keywords={insight.risingKeywords} onKeyword={onKeyword} />
          </SectionCard>
          {/* 시즌 키워드는 검색어와 무관한 지표라 검색어가 없을 때만 보여준다 */}
          {!keyword && <KeywordChips title="시즌 키워드" icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth onKeyword={onKeyword} />}
          <KeywordChips title="관련 키워드" icon={Link2} keywords={insight.relatedKeywords} onKeyword={onKeyword} />
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
function BlogView({ insight, keyword, onKeyword, onClear }: { insight: NaverTrendInsight } & KeywordHandlers) {
  const ideas = (
    <SectionCard title={keyword ? `'${keyword}' 글 아이디어` : "콘텐츠 아이디어"} icon={Lightbulb} flush>
      <ul className="divide-y divide-line">
        {insight.contentIdeas.map((idea) => (
          <li key={idea} className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-sm text-fg">{idea}</span>
            <Link
              href={`/naver-blog/info-writing?${new URLSearchParams({ topic: idea, ...(keyword ? { mainKeyword: keyword } : {}) }).toString()}`}
              className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle hover:text-brand"
            >
              글쓰기
              <ArrowUpRight className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
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
          <SectionCard title="관련 검색어" icon={Link2} description="누르면 그 검색어로 조회합니다." flush>
            <KeywordTable keywords={insight.relatedKeywords} showGrowth={false} onKeyword={onKeyword} />
          </SectionCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="급상승 키워드" icon={Zap} description="현재 분석 기준" flush>
            <KeywordTable keywords={insight.risingKeywords} compact onKeyword={onKeyword} />
          </SectionCard>
          <KeywordChips title="시즌 키워드" icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth onKeyword={onKeyword} />
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
        <SectionCard title="관련 검색어" icon={Link2} description="누르면 그 검색어로 다시 조회합니다." flush>
          <KeywordTable keywords={insight.relatedKeywords} showGrowth={false} onKeyword={onKeyword} />
        </SectionCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
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
}: {
  title: string;
  icon: typeof Zap;
  keywords: Keyword[];
  showGrowth?: boolean;
  onKeyword?: (k: string) => void;
}) {
  return (
    <SectionCard title={title} icon={icon}>
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
    </SectionCard>
  );
}
