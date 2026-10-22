"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame, Loader2 } from "lucide-react";
import type { YouTubeChannelInsight, YouTubeChannelVideo } from "@/lib/types/youtube-channel";
import { CHANNEL_HIT_OPTIONS } from "@/lib/types/youtube-channel";
import { api } from "@/lib/api-client";
import { Badge, Drawer, EmptyState, ErrorState, SegmentedControl } from "@/components/ui";
import { MakeMenu } from "@/components/shared/MakeMenu";
import { ScrapButton } from "@/components/shared/ScrapButton";
import { SaveTitlesToFormat } from "@/features/ai-learning/SaveTitlesToFormat";
import { cn, formatCompact, formatDate, formatNumber } from "@/lib/utils";
import { infoVideoHref, productVideoHref } from "./trend-links";

type Fmt = "all" | "shorts" | "long";

/**
 * 채널 정보 · 최근 6개월 뜬 영상 (v0.9.61). 채널 이름을 누르면 열린다 (그때 1번만 불러옴, 같은 채널 30분 기억).
 * 기준: 같은 형식(Shorts·롱폼) 조회수 중앙값의 1.5·2·3배 이상. 거르기는 받은 결과 안에서 (추가 호출 없음).
 */
export function ChannelDrawer({ channelId, channelName, onClose }: { channelId: string | null; channelName?: string; onClose: () => void }) {
  const [data, setData] = useState<{ id: string; value: YouTubeChannelInsight } | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [hit, setHit] = useState<string>("2");
  const [fmt, setFmt] = useState<Fmt>("all");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!channelId || data?.id === channelId) return;
    let alive = true;
    api.trends
      .youtubeChannel(channelId)
      .then((value) => alive && setData({ id: channelId, value }))
      .catch((e) => alive && setError({ id: channelId, message: e instanceof Error ? e.message : "채널 정보를 불러오지 못했습니다." }));
    return () => {
      alive = false;
    };
  }, [channelId, data?.id, retry]);

  const insight = data?.id === channelId ? data.value : null;
  const failed = error?.id === channelId ? error.message : null;
  const hits = useMemo(() => {
    if (!insight) return [];
    const min = Number(hit);
    return insight.videos.filter((v) => v.ratio != null && v.ratio >= min && (fmt === "all" || v.format === fmt)).sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0));
  }, [insight, hit, fmt]);
  const c = insight?.channel;

  return (
    <Drawer open={Boolean(channelId)} onClose={onClose} title={c?.title ?? channelName ?? "채널"}>
      {failed ? (
        <ErrorState message={failed} onRetry={() => {
            setError(null);
            setRetry((n) => n + 1);
          }} />
      ) : !insight || !c ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-fg-subtle">
          <Loader2 className="size-4 animate-spin" /> 채널 정보를 불러오는 중…
        </div>
      ) : (
        <div className="space-y-5" data-channel-drawer>
          <div className="flex items-start gap-3">
            {c.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- YouTube 채널 사진 주소 그대로
              <img src={c.thumbnailUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="size-14 shrink-0 rounded-full bg-muted" />
            )}
            <div className="min-w-0 space-y-1 text-[13px]">
              <p className="text-[15px] font-semibold text-fg">{c.title}</p>
              {c.handle && <p className="text-fg-subtle">{c.handle}</p>}
              <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                YouTube 채널 열기 <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4" data-channel-stats>
            <Stat label="구독자" value={c.subscribers == null ? "숨김" : formatCompact(c.subscribers)} />
            <Stat label="전체 영상" value={c.videoCount == null ? "-" : formatNumber(c.videoCount)} />
            <Stat label="최근 6개월 업로드" value={`${formatNumber(insight.videos.length)}${insight.truncated ? "+" : ""}`} />
            <Stat label="개설일" value={c.createdAt ? formatDate(c.createdAt) : "-"} />
          </dl>
          {c.description && <p className="line-clamp-3 text-xs whitespace-pre-line text-fg-subtle">{c.description}</p>}

          <div className="rounded-control border border-line bg-subtle/60 px-3 py-2 text-[12.5px] text-fg-muted" data-channel-median>
            최근 6개월 조회수 <b>중앙값</b> · Shorts {insight.median.shorts == null ? `비교 불가 (${insight.median.shortsSample}개)` : `${formatCompact(insight.median.shorts)} (${insight.median.shortsSample}개)`} · 롱폼{" "}
            {insight.median.long == null ? `비교 불가 (${insight.median.longSample}개)` : `${formatCompact(insight.median.long)} (${insight.median.longSample}개)`}
          </div>

          <div className="flex flex-wrap items-center gap-2" data-channel-filter>
            <span className="text-[13px] font-semibold text-fg">뜬 영상 기준</span>
            <SegmentedControl size="sm" value={hit} onChange={setHit} options={CHANNEL_HIT_OPTIONS.map((x) => ({ value: String(x), label: `${x}배 이상` }))} />
            <SegmentedControl
              size="sm"
              value={fmt}
              onChange={setFmt}
              options={[
                { value: "all", label: "전체" },
                { value: "shorts", label: "Shorts" },
                { value: "long", label: "롱폼" },
              ]}
            />
          </div>

          {hits.length === 0 ? (
            <EmptyState compact icon={Flame} title={`중앙값의 ${hit}배 넘게 뜬 영상이 없습니다`} description="기준을 낮추거나 형식을 바꿔 보세요." />
          ) : (
            <ul className="space-y-2" data-channel-hits>
              {hits.map((v) => (
                <HitRow key={v.videoId} v={v} channelName={c.title} />
              ))}
            </ul>
          )}
          <p className="text-[11px] text-fg-subtle">
            Shorts·롱폼은 따로 비교합니다 (최근에 올린 영상은 조회수가 아직 쌓이는 중). 같은 채널은 30분 동안 다시 부르지 않습니다{insight.units ? ` · 이번에 YouTube 할당량 ${insight.units} units (하루 무료 10,000)` : ""}.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function HitRow({ v, channelName }: { v: YouTubeChannelVideo; channelName: string }) {
  const keywords = v.tags.slice(0, 6);
  return (
    <li className="flex gap-3 rounded-control border border-line p-2" data-channel-hit>
      <a href={v.url} target="_blank" rel="noreferrer" className={cn("relative shrink-0 overflow-hidden rounded bg-muted", v.format === "shorts" ? "h-20 w-12" : "h-16 w-28")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일 주소 그대로 */}
        {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />}
      </a>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] font-medium text-fg">{v.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-subtle">
          <Badge tone={(v.ratio ?? 0) >= 3 ? "danger" : "warning"}>×{v.ratio}</Badge>
          <span>{v.format === "shorts" ? "Shorts" : "롱폼"}</span>
          <span>조회수 {v.views == null ? "-" : formatCompact(v.views)}</span>
          <span>{formatDate(v.publishedAt)}</span>
        </p>
      </div>
      <span className="flex shrink-0 items-start">
        <ScrapButton item={{ source: "youtube", itemId: v.videoId, title: v.title, url: v.url, channelName, thumbnailUrl: v.thumbnailUrl, keywords, tags: v.tags, views: v.views, publishedAt: v.publishedAt, format: v.format }} />
        <SaveTitlesToFormat titles={[{ title: v.title, views: v.views, videoId: v.videoId }]} source="YouTube 채널" buttonLabel="제목 대본 포맷에 담기" variant="ghost" iconOnly />
        <MakeMenu
          iconOnly
          label="이 영상으로 영상 만들기"
          items={[
            { label: "제품 홍보 영상 만들기", href: productVideoHref({ trendTitle: v.title, keywords: keywords.length ? keywords : [v.title] }) },
            { label: "정보성 영상 만들기", href: infoVideoHref({ trendTitle: v.title, keywords: keywords.length ? keywords : [v.title] }) },
          ]}
        />
      </span>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-line px-2.5 py-2">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="tabular text-[14px] font-semibold text-fg">{value}</dd>
    </div>
  );
}
