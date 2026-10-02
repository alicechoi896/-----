"use client";

import { useState } from "react";
import { ExternalLink, Lightbulb, PackageOpen, Sparkles, Star, Video } from "lucide-react";
import type { YouTubeTrendItem, YouTubeVideoAnalysis } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge, Button, CopyButton, Drawer, LinkButton, Notice, Tag } from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils";
import { infoVideoHref, productVideoHref, trendPrefill } from "./trend-links";

/**
 * 영상 상세 패널: 전체 태그·설명, AI 분석(잘된 이유 + 추천 제목), 찜, "이 트렌드로 만들기".
 * AI 분석은 버튼을 눌렀을 때만 실행한다 (AI 비용 절약). 찜한 영상이면 분석 결과가 함께 저장된다.
 */
export function VideoDetailDrawer({
  item,
  saved,
  savedAnalysis,
  onClose,
  onToggleSave,
  onKeywordClick,
}: {
  item: YouTubeTrendItem | null;
  saved: boolean;
  savedAnalysis?: YouTubeVideoAnalysis | null;
  onClose: () => void;
  onToggleSave: (item: YouTubeTrendItem) => void;
  onKeywordClick: (keyword: string) => void;
}) {
  // 영상이 바뀌면 key 로 내부 상태를 새로 만든다
  return (
    <Drawer
      open={Boolean(item)}
      onClose={onClose}
      title={item ? <span className="line-clamp-2">{item.title}</span> : null}
    >
      {item && (
        <DetailBody
          key={item.id}
          item={item}
          saved={saved}
          savedAnalysis={savedAnalysis ?? null}
          onToggleSave={onToggleSave}
          onKeywordClick={onKeywordClick}
        />
      )}
    </Drawer>
  );
}

function DetailBody({
  item,
  saved,
  savedAnalysis,
  onToggleSave,
  onKeywordClick,
}: {
  item: YouTubeTrendItem;
  saved: boolean;
  savedAnalysis: YouTubeVideoAnalysis | null;
  onToggleSave: (item: YouTubeTrendItem) => void;
  onKeywordClick: (keyword: string) => void;
}) {
  const [analysis, setAnalysis] = useState<YouTubeVideoAnalysis | null>(savedAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefill = trendPrefill(item, analysis);
  const ratio = item.views / Math.max(item.channelSubscribers, 1);

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const { provider, ...result } = await api.trends.analyzeVideo(item);
      void provider;
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석하지 못했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <VideoThumb
          className={item.format === "shorts" ? "h-[150px] w-[86px]" : "h-[101px] w-[180px]"}
          thumbnailUrl={item.thumbnailUrl}
          color={item.thumbnailColor}
          durationSec={item.durationSec}
          shorts={item.format === "shorts"}
        />
        <div className="min-w-0 space-y-1.5 text-[13px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <FormatBadge format={item.format} />
            <Badge tone="neutral">{item.category}</Badge>
            <Badge tone="neutral">길이 {formatDuration(item.durationSec)}</Badge>
          </div>
          <p className="font-medium text-fg">{item.channelName}</p>
          <p className="text-fg-subtle">구독자 {formatNumber(item.channelSubscribers)}명</p>
          <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
            YouTube 에서 보기 <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-[13px]">
        <Stat label="조회수" value={formatNumber(item.views)} />
        <Stat label="일평균 조회수" value={formatNumber(item.viewsPerDay)} />
        <Stat label="구독자 대비" value={`${ratio.toFixed(1)}배`} />
        <Stat label="좋아요" value={item.likeCount == null ? "비공개" : formatNumber(item.likeCount)} />
        <Stat label="댓글" value={item.commentCount == null ? "사용 안 함" : formatNumber(item.commentCount)} />
        <Stat label="게시일" value={formatDate(item.publishedAt)} />
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button variant={saved ? "subtle" : "secondary"} icon={Star} onClick={() => onToggleSave(item)} className={saved ? "text-warning" : undefined}>
          {saved ? "찜 해제" : "찜하기"}
        </Button>
        <LinkButton href={infoVideoHref(prefill)} icon={Video} variant="primary">
          이 트렌드로 정보성 영상 만들기
        </LinkButton>
        <LinkButton href={productVideoHref(prefill)} icon={PackageOpen}>
          제품 홍보 영상 만들기
        </LinkButton>
      </div>
      <p className="-mt-3 text-xs text-fg-subtle">
        생성 화면에 참고 트렌드·주제·키워드가 미리 채워집니다.{analysis ? " (AI 추천 제목·키워드 사용)" : ""}
      </p>

      <section className="space-y-3 rounded-card border border-line p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-fg">
            <Lightbulb className="size-4 text-warning" />
            잘된 이유 · 추천 제목
          </h3>
          <Button size="sm" variant={analysis ? "ghost" : "primary"} icon={Sparkles} loading={analyzing} onClick={() => void analyze()}>
            {analysis ? "다시 분석" : "AI 분석"}
          </Button>
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        {!analysis && !analyzing && !error && (
          <p className="text-[13px] text-fg-subtle">제목·태그·조회 지표를 보고 이 영상이 잘된 이유와 내 채널에서 쓸 제목을 추천합니다. (AI 1회 호출)</p>
        )}
        {analysis && (
          <div className="space-y-4 text-[13px]">
            <ul className="space-y-1.5">
              {analysis.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 leading-relaxed text-fg">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand" />
                  {r}
                </li>
              ))}
            </ul>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-medium text-fg-subtle">추천 제목</p>
                <CopyButton value={analysis.titleSuggestions} label="전체 복사" />
              </div>
              <ol className="space-y-1">
                {analysis.titleSuggestions.map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-control bg-subtle px-2.5 py-1.5">
                    <span className="text-fg">
                      <span className="tabular mr-1.5 text-fg-subtle">{i + 1}.</span>
                      {t}
                    </span>
                    <LinkButton size="sm" variant="ghost" href={infoVideoHref({ ...prefill, topic: t })}>
                      이 제목으로
                    </LinkButton>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-subtle">추천 키워드</p>
              <div className="flex flex-wrap gap-1">
                {analysis.keywords.map((k) => (
                  <Tag key={k}>{k}</Tag>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-fg">태그 {item.tags.length ? `(${item.tags.length})` : ""}</h3>
        {item.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((t) => (
              <button key={t} type="button" onClick={() => onKeywordClick(t)} title="이 태그로 검색">
                <Tag className="hover:bg-brand-soft hover:text-brand">{t}</Tag>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-fg-subtle">공개된 태그가 없습니다.</p>
        )}
      </section>

      {item.description && (
        <section>
          <h3 className="mb-2 text-[13px] font-semibold text-fg">설명 (앞부분)</h3>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg-muted">{item.description}</p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-subtle px-3 py-2">
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold text-fg">{value}</dd>
    </div>
  );
}

export function FormatBadge({ format }: { format: "shorts" | "long" }) {
  return format === "shorts" ? <Badge tone="danger">Shorts</Badge> : <Badge tone="info">롱폼</Badge>;
}
