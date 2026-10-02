"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, CalendarRange, Lightbulb, Link2, Search, TrendingUp, Zap } from "lucide-react";
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
  SearchInput,
  SectionCard,
  SegmentedControl,
  Select,
  Tag,
  TrendLineChart,
  type Column,
} from "@/components/ui";
import { formatNumber } from "@/lib/utils";

const PERIODS = [
  { value: "7", label: "7일" },
  { value: "14", label: "14일" },
  { value: "30", label: "30일" },
];

const COMPETITION = { low: { label: "낮음", tone: "success" }, mid: { label: "보통", tone: "warning" }, high: { label: "높음", tone: "danger" } } as const;

/**
 * 네이버 트렌드 탐색 (NAVER Clip / NAVER Blog 공용).
 * - scope="clip": 급상승 주제 → 클립 소재 중심
 * - scope="blog": 검색어 중심, 검색 추이 차트, 관련 검색어, 콘텐츠 아이디어
 * YouTube 트렌드와는 데이터 출처(NaverTrendProvider)가 다른 별도 기능이다.
 */
export function NaverTrendExplorer({ scope }: { scope: "clip" | "blog" }) {
  const [category, setCategory] = useState("생활/주방");
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("14");

  const { data, loading, error, reload } = useAsync(
    () => api.trends.naver({ scope, category, keyword, periodDays: Number(period) }),
    [scope, category, keyword, period],
  );
  const insight = data?.insight;

  return (
    <div className="space-y-5">
      <FilterBar
        actions={
          <Button variant="primary" icon={Search} onClick={() => setKeyword(keywordInput.trim())}>
            조회
          </Button>
        }
      >
        <FilterItem label="카테고리">
          <Select className="w-40" value={category} options={CATEGORY_OPTIONS} onChange={(e) => setCategory(e.target.value)} />
        </FilterItem>
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
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        </FilterItem>
      </FilterBar>

      {loading ? (
        <SectionCard>
          <LoadingState variant="skeleton" rows={6} />
        </SectionCard>
      ) : error || !insight ? (
        <SectionCard>
          <ErrorState message={error ?? "데이터가 없습니다."} onRetry={reload} />
        </SectionCard>
      ) : scope === "clip" ? (
        <ClipView insight={insight} />
      ) : (
        <BlogView insight={insight} keyword={keyword} />
      )}
    </div>
  );
}

/* ───────── NAVER Clip ───────── */

function ClipView({ insight }: { insight: NaverTrendInsight }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <SectionCard title="급상승 주제" icon={Zap} description="클립 소재로 쓰기 좋은 주제입니다." flush>
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
                    <Tag key={k}>{k}</Tag>
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
        <SectionCard title="급상승 키워드" icon={TrendingUp} flush>
          <KeywordTable keywords={insight.risingKeywords} />
        </SectionCard>
        <KeywordChips title="시즌 키워드" icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth />
        <KeywordChips title="관련 키워드" icon={Link2} keywords={insight.relatedKeywords} />
      </div>
    </div>
  );
}

/* ───────── NAVER Blog ───────── */

function BlogView({ insight, keyword }: { insight: NaverTrendInsight; keyword: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SectionCard
          title={`최근 검색 추이${keyword ? ` · ${keyword}` : ""}`}
          icon={TrendingUp}
          description="기간 내 최대값을 100으로 둔 상대 지수입니다."
        >
          <TrendLineChart data={insight.searchTrend} />
        </SectionCard>
        <SectionCard title="관련 검색어" icon={Link2} flush>
          <KeywordTable keywords={insight.relatedKeywords} showGrowth={false} />
        </SectionCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="급상승 키워드" icon={Zap} flush>
          <KeywordTable keywords={insight.risingKeywords} compact />
        </SectionCard>
        <KeywordChips title="시즌 키워드" icon={CalendarRange} keywords={insight.seasonalKeywords} showGrowth />
        <SectionCard title="콘텐츠 아이디어" icon={Lightbulb} flush>
          <ul className="divide-y divide-line">
            {insight.contentIdeas.map((idea) => (
              <li key={idea} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm text-fg">{idea}</span>
                <Link
                  href={`/naver-blog/info-writing?topic=${encodeURIComponent(idea)}`}
                  className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle hover:text-brand"
                >
                  글쓰기
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

/* ───────── 공용 조각 ───────── */

function KeywordTable({ keywords, showGrowth = true, compact }: { keywords: Keyword[]; showGrowth?: boolean; compact?: boolean }) {
  const columns: Column<Keyword>[] = [
    { key: "text", header: "키워드", render: (k) => <span className="font-medium">{k.text}</span> },
    { key: "volume", header: "월간 검색량", numeric: true, render: (k) => (k.volume ? formatNumber(k.volume) : "-") },
    ...(showGrowth
      ? [{ key: "growth", header: "증가율", numeric: true, render: (k: Keyword) => <span className="text-danger">+{k.growthRate}%</span> }]
      : []),
    ...(!compact
      ? [
          {
            key: "competition",
            header: "경쟁",
            align: "center" as const,
            render: (k: Keyword) => (k.competition ? <Badge tone={COMPETITION[k.competition].tone}>{COMPETITION[k.competition].label}</Badge> : "-"),
          },
        ]
      : []),
  ];
  return <DataTable dense columns={columns} rows={keywords} rowKey={(k) => k.text} />;
}

function KeywordChips({
  title,
  icon,
  keywords,
  showGrowth,
}: {
  title: string;
  icon: typeof Zap;
  keywords: Keyword[];
  showGrowth?: boolean;
}) {
  return (
    <SectionCard title={title} icon={icon}>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((k) => (
          <Tag key={k.text}>
            {k.text}
            {showGrowth && k.growthRate != null && <span className="ml-1.5 text-danger">+{k.growthRate}%</span>}
          </Tag>
        ))}
      </div>
    </SectionCard>
  );
}
