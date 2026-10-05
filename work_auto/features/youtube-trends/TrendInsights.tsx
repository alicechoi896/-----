"use client";

import { useMemo, useState } from "react";
import { Hash, Sparkles } from "lucide-react";
import { recommendKeywords } from "@/lib/domain/youtube";
import type { YouTubeTopicSuggestion, YouTubeTrendItem } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Button, CopyButton, Notice, SectionCard } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FormatBadge } from "./VideoDetailDrawer";
import { infoVideoHref, productVideoHref } from "./trend-links";
import { MakeMenu } from "@/components/shared/MakeMenu";

/**
 * 추천 키워드 (불러온 영상의 태그·제목에서 즉시 계산) + 추천 주제 (AI, 버튼을 눌렀을 때만).
 */
export function TrendInsights({
  items,
  activeKeyword,
  onKeywordClick,
}: {
  items: YouTubeTrendItem[];
  activeKeyword?: string;
  onKeywordClick: (keyword: string) => void;
}) {
  const keywords = useMemo(() => recommendKeywords(items, 14), [items]);
  const [topics, setTopics] = useState<YouTubeTopicSuggestion[] | null>(null);
  const [topicsFor, setTopicsFor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const top = [...items].sort((a, b) => b.trendScore - a.trendScore).slice(0, 30);
      const res = await api.trends.suggestTopics(top, keywords.map((k) => k.text));
      setTopics(res.topics);
      setTopicsFor(items.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추천하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <SectionCard
        title="추천 키워드"
        icon={Hash}
        actions={keywords.length > 0 && <CopyButton value={keywords.map((k) => k.text).join(", ")} label="전체 복사" />}
        description="불러온 영상의 태그·제목에 자주 나오고, 성과(Trend Score)가 좋은 영상에 붙은 단어 순서입니다. 누르면 그 키워드로 검색합니다."
      >
        {keywords.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">영상을 불러오면 키워드를 추천합니다.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((k, i) => (
              <button
                key={k.text}
                type="button"
                onClick={() => onKeywordClick(k.text)}
                title={`영상 ${k.count}개에 등장`}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[13px] transition-colors",
                  activeKeyword === k.text
                    ? "border-brand bg-brand text-white"
                    : i < 3
                      ? "border-brand-line bg-brand-soft text-brand hover:bg-brand/10"
                      : "border-line bg-canvas text-fg-muted hover:border-brand-line hover:text-brand",
                )}
              >
                {k.text}
                <span className={cn("tabular text-[11px]", activeKeyword === k.text ? "text-white/80" : "text-fg-subtle")}>{k.count}</span>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="추천 주제"
        icon={Sparkles}
        description="불러온 영상 상위 30개의 공통 패턴으로 AI 가 새 영상 주제를 제안합니다."
        actions={
          <Button size="sm" variant={topics ? "ghost" : "primary"} icon={Sparkles} loading={loading} disabled={items.length < 3} onClick={() => void suggest()}>
            {topics ? "다시 추천" : "AI 주제 추천"}
          </Button>
        }
      >
        {error && <Notice tone="warning">{error}</Notice>}
        {!topics && !error && (
          <p className="text-[13px] text-fg-subtle">
            {items.length < 3 ? "영상을 3개 이상 불러오면 추천할 수 있습니다." : "[AI 주제 추천] 을 누르면 주제 6개를 제안합니다. (AI 1회 호출)"}
          </p>
        )}
        {topics && (
          <>
            {topicsFor !== items.length && (
              <p className="mb-2 text-xs text-fg-subtle">영상 목록이 바뀌었습니다. 새 목록 기준으로 보려면 [다시 추천] 을 누르세요.</p>
            )}
            <ul className="divide-y divide-line">
              {topics.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-fg">
                      <FormatBadge format={t.format} />
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{t.angle}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{t.keywords.join(" · ")}</p>
                  </div>
                  <MakeMenu
                    items={[
                      { label: "제품 홍보 영상 만들기", href: productVideoHref({ trendTitle: t.title, topic: t.title, keywords: t.keywords }) },
                      { label: "정보성 영상 만들기", href: infoVideoHref({ trendTitle: t.title, topic: t.title, keywords: t.keywords }) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </div>
  );
}
