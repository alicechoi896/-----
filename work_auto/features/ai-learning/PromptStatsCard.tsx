"use client";

import { FlaskConical } from "lucide-react";
import type { PromptVersionRow } from "@/lib/domain/prompt-stats";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, DataTable, EmptyState, ErrorState, LoadingState, SectionCard, type Column } from "@/components/ui";
import { cn, formatNumber } from "@/lib/utils";

const pct = (v: number | null) => (v == null ? "-" : `${Math.round(v * 100)}%`);
const PROMPT_NAME: Record<string, string> = {
  "youtube.product-video": "YouTube 제품 영상",
  "youtube.info-video": "YouTube 정보성 영상",
  "naver-clip.product-content": "클립 제품",
  "naver-clip.info-content": "클립 정보성",
  "naver-blog.product-writing": "블로그 제품 글",
  "naver-blog.info-writing": "블로그 정보 글",
  "naver-blog.auto-writing": "블로그 자동 글",
};

/**
 * 프롬프트 버전별 성과표 (v0.9.34, docs/PROMPT_STATS.md)
 * 같은 기능에서 버전(1.11.0 → 1.12.0 등)·생성 방식(빠른·정밀)마다 👍 비율·직접 수정·업로드율·평균 조회수를 비교한다.
 * 이전 버전보다 좋아진 값은 초록색으로 표시한다.
 */
export function PromptStatsCard() {
  const { data, loading, error, reload } = useAsync(() => api.memory.promptStats(), []);
  const rows = data ?? [];
  // 같은 프롬프트·생성 방식의 바로 이전 버전과 비교
  const prevOf = (r: PromptVersionRow) => {
    const same = rows.filter((x) => x.promptId === r.promptId && x.mode === r.mode);
    const i = same.indexOf(r);
    return same[i + 1] ?? null;
  };
  const better = (cur: number | null, prev: number | null | undefined, lowerIsBetter = false) =>
    cur != null && prev != null && (lowerIsBetter ? cur < prev : cur > prev) ? "text-success font-semibold" : "";

  const columns: Column<PromptVersionRow>[] = [
    {
      key: "prompt",
      header: "기능 · 프롬프트",
      render: (r) => (
        <span className="whitespace-nowrap">
          <span className="font-medium text-fg">{PROMPT_NAME[r.promptId] ?? r.promptId}</span>
          <span className="ml-1.5 text-xs text-fg-subtle">v{r.version}</span>
          {r.mode === "precise" && (
            <Badge tone="brand" className="ml-1.5">
              정밀
            </Badge>
          )}
        </span>
      ),
    },
    { key: "count", header: "생성", numeric: true, render: (r) => formatNumber(r.count) },
    {
      key: "up",
      header: "👍 비율",
      numeric: true,
      render: (r) => (
        <span className={better(r.upRate, prevOf(r)?.upRate)} title={`평가 ${r.rated}개`}>
          {pct(r.upRate)}
          {r.rated > 0 && <span className="ml-1 text-[11px] font-normal text-fg-subtle">({r.rated})</span>}
        </span>
      ),
    },
    {
      key: "edit",
      header: "직접 수정",
      numeric: true,
      render: (r) => (
        <span className={better(r.avgEditRatio, prevOf(r)?.avgEditRatio, true)} title="고친 결과 비율 · 고친 결과의 평균 수정 정도 (적을수록 좋음)">
          {pct(r.editedRate)}
          {r.avgEditRatio != null && <span className="ml-1 text-[11px] font-normal text-fg-subtle">· {pct(r.avgEditRatio)} 바뀜</span>}
        </span>
      ),
    },
    { key: "upload", header: "업로드율", numeric: true, render: (r) => <span className={better(r.uploadRate, prevOf(r)?.uploadRate)}>{pct(r.uploadRate)}</span> },
    {
      key: "views",
      header: "평균 조회수",
      numeric: true,
      render: (r) => (
        <span className={better(r.avgViews, prevOf(r)?.avgViews)} title={`조회수가 있는 결과 ${r.viewed}개`}>
          {r.avgViews == null ? "-" : formatNumber(r.avgViews)}
          {r.viewed > 0 && <span className="ml-1 text-[11px] font-normal text-fg-subtle">({r.viewed})</span>}
        </span>
      ),
    },
    {
      key: "period",
      header: "기간",
      render: (r) => (
        <span className={cn("text-xs whitespace-nowrap text-fg-subtle")}>
          {r.firstAt.slice(5, 10)} ~ {r.lastAt.slice(5, 10)}
        </span>
      ),
    },
  ];

  return (
    <SectionCard
      title="프롬프트 버전별 성과"
      icon={FlaskConical}
      description="프롬프트를 바꾼 뒤 결과가 실제로 좋아졌는지 확인합니다. 초록색 = 같은 기능·생성 방식의 바로 이전 버전보다 좋아진 값 (수정은 적을수록 좋음). 괄호 = 표본 수 — 표본이 적으면 참고만 하세요."
      flush
    >
      {loading ? (
        <LoadingState variant="skeleton" rows={3} className="p-5" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.promptId}:${r.version}:${r.mode}`} empty={<EmptyState compact title="아직 생성한 결과가 없습니다" />} />
      )}
    </SectionCard>
  );
}
