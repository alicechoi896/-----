"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Flame, Search, TrendingUp } from "lucide-react";
import { CATEGORY_OPTIONS } from "@/lib/generators/configs";
import { trendScoreLevel } from "@/lib/domain/trend-score";
import type { TrendPeriod, YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterItem,
  LoadingState,
  SearchInput,
  SectionCard,
  SegmentedControl,
  Select,
  StatTile,
  Tag,
  type Column,
} from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { formatCompact, formatDate, formatNumber } from "@/lib/utils";

const PERIODS = [
  { value: "7", label: "7일" },
  { value: "14", label: "14일" },
  { value: "21", label: "21일" },
];
const FORMATS = [
  { value: "all", label: "전체" },
  { value: "shorts", label: "Shorts" },
  { value: "long", label: "일반 영상" },
];
const SORTS = [
  { value: "trendScore", label: "Trend Score 높은 순" },
  { value: "viewsPerDay", label: "일평균 조회수 높은 순" },
  { value: "views", label: "조회수 높은 순" },
  { value: "publishedAt", label: "최신순" },
];

/**
 * YouTube 트렌드 찾기.
 * 필터 → GET /api/trends/youtube → 요약 타일 + 결과 표.
 * 실제 연동 시 바뀌는 것은 서버의 YouTubeTrendProvider 구현뿐이다.
 */
export function YouTubeTrendExplorer() {
  const [category, setCategory] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("7");
  const [format, setFormat] = useState<NonNullable<YouTubeTrendQuery["format"]>>("all");
  const [sort, setSort] = useState<NonNullable<YouTubeTrendQuery["sort"]>>("trendScore");

  const query: YouTubeTrendQuery = { category, keyword, periodDays: Number(period) as TrendPeriod, format, sort };
  const { data, loading, error, reload } = useAsync(
    () => api.trends.youtube(query),
    [category, keyword, period, format, sort],
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  const stats = useMemo(() => {
    if (!items.length) return null;
    const avg = items.reduce((s, i) => s + i.trendScore, 0) / items.length;
    const fastest = [...items].sort((a, b) => b.viewsPerDay - a.viewsPerDay)[0];
    const freq = new Map<string, number>();
    items.forEach((i) => i.keywords.forEach((k) => freq.set(k, (freq.get(k) ?? 0) + 1)));
    const topKeywords = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
    return { avg, fastest, topKeywords };
  }, [items]);

  const columns: Column<YouTubeTrendItem>[] = [
    {
      key: "thumb",
      header: "썸네일",
      width: "104px",
      render: (r) => (
        <VideoThumb
          className="h-[48px] w-[84px]"
          thumbnailUrl={r.thumbnailUrl}
          color={r.thumbnailColor}
          durationSec={r.durationSec}
          shorts={r.format === "shorts"}
        />
      ),
    },
    {
      key: "title",
      header: "제목",
      render: (r) => (
        <div className="min-w-[220px]">
          <a href={r.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-fg hover:text-brand">
            {r.title}
          </a>
          <p className="mt-0.5 text-xs text-fg-subtle">{r.category}</p>
        </div>
      ),
    },
    {
      key: "channel",
      header: "채널",
      render: (r) => (
        <div className="whitespace-nowrap">
          <p className="text-fg-muted">{r.channelName}</p>
          <p className="tabular text-xs text-fg-subtle">구독자 {formatCompact(r.channelSubscribers)}</p>
        </div>
      ),
    },
    { key: "publishedAt", header: "게시일", render: (r) => <span className="tabular whitespace-nowrap text-fg-muted">{formatDate(r.publishedAt)}</span> },
    { key: "views", header: "조회수", numeric: true, render: (r) => formatNumber(r.views) },
    { key: "viewsPerDay", header: "일평균 조회수", numeric: true, render: (r) => <span className="font-medium">{formatNumber(r.viewsPerDay)}</span> },
    {
      key: "keywords",
      header: "주요 키워드",
      render: (r) => (
        <div className="flex gap-1" title={r.keywords.join(", ")}>
          {r.keywords.slice(0, 2).map((k) => (
            <Tag key={k}>{k}</Tag>
          ))}
          {r.keywords.length > 2 && <span className="self-center text-xs text-fg-subtle">+{r.keywords.length - 2}</span>}
        </div>
      ),
    },
    { key: "trendScore", header: "Trend Score", width: "112px", render: (r) => <TrendScore score={r.trendScore} /> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (r) => (
        <Link
          href={`/youtube/info-video?trendId=${r.id}`}
          aria-label="이 트렌드로 정보성 영상 만들기"
          title="이 트렌드로 정보성 영상 만들기"
          className="inline-flex size-8 items-center justify-center rounded-control text-fg-subtle hover:bg-muted hover:text-brand"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <FilterBar
        actions={
          <Button variant="primary" icon={Search} onClick={() => setKeyword(keywordInput.trim())}>
            검색
          </Button>
        }
      >
        <FilterItem label="카테고리">
          <Select className="w-40" value={category} options={CATEGORY_OPTIONS} placeholder="전체 카테고리" onChange={(e) => setCategory(e.target.value)} />
        </FilterItem>
        <FilterItem label="검색 키워드">
          <SearchInput
            className="w-56"
            value={keywordInput}
            placeholder="예: 에어프라이어"
            onValueChange={(v) => {
              setKeywordInput(v);
              if (!v) setKeyword("");
            }}
            onSubmit={() => setKeyword(keywordInput.trim())}
          />
        </FilterItem>
        <FilterItem label="기간">
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        </FilterItem>
        <FilterItem label="영상 유형">
          <SegmentedControl options={FORMATS} value={format} onChange={(v) => setFormat(v as typeof format)} />
        </FilterItem>
        <FilterItem label="정렬">
          <Select className="w-48" value={sort} options={SORTS} onChange={(e) => setSort(e.target.value as typeof sort)} />
        </FilterItem>
      </FilterBar>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="검색 결과" value={loading ? "-" : items.length} unit="개" hint={`최근 ${period}일 게시 영상`} />
        <StatTile label="평균 Trend Score" value={stats ? Math.round(stats.avg) : "-"} hint="0~100, 높을수록 급상승" />
        <StatTile
          label="최고 일평균 조회수"
          value={stats ? formatCompact(stats.fastest.viewsPerDay) : "-"}
          hint={stats?.fastest.title}
        />
        <StatTile label="자주 등장한 키워드" value={stats?.topKeywords[0] ?? "-"} hint={stats?.topKeywords.slice(1).join(", ")} />
      </div>

      <SectionCard
        title="트렌드 영상"
        icon={TrendingUp}
        description="Trend Score = 조회 속도 50% + 구독자 대비 조회 비율 30% + 최근성 20%"
        flush
      >
        {loading ? (
          <LoadingState variant="skeleton" rows={6} className="p-5" />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(r) => r.id}
            empty={<EmptyState title="조건에 맞는 영상이 없습니다" description="기간을 늘리거나 카테고리·키워드 조건을 바꿔 보세요." />}
          />
        )}
      </SectionCard>
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
