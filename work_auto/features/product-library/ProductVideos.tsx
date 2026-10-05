"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download, ExternalLink, Film, FolderDown, ListPlus, Unlink } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { PLATFORM_LABEL, parseVideoLinks } from "@/lib/video-links";
import { Button, EmptyState, ErrorState, IconButton, LoadingState, Notice, SectionCard, Textarea } from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { formatRelative } from "@/lib/utils";
import { XhsJobStatus, useXhsDownloads } from "@/features/video-import/useXhsDownloads";

const MAX_BATCH = 20;

/**
 * 제품 상세 > 연결된 영상.
 * 이 제품에 연결한 참고 영상(주로 샤오홍슈)을 보여 주고, 필요할 때 바로 다시 받을 수 있게 한다.
 * - 샤오홍슈: [다운로드] 워터마크 없는 원본·소리 없음 (영상 URL 가져오기와 같은 기능)
 * - 링크를 넣으면 이 제품에 연결된 채로 가져온다
 */
export function ProductVideos({ productId }: { productId: string }) {
  const list = useAsync(() => api.videos.list(), []);
  const xhs = useXhsDownloads();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  const videos = (list.data ?? []).filter((v) => v.productId === productId);
  const xhsVideos = videos.filter((v) => v.platform === "xiaohongshu");
  const links = parseVideoLinks(text);

  async function handleImport() {
    if (!links.length) return;
    setImporting(true);
    setMessage(null);
    try {
      const res = await api.videos.importMany(links.slice(0, MAX_BATCH), undefined, productId);
      const added = res.filter((r) => r.ok && r.video).map((r) => r.video!);
      list.setData((prev) => [...added, ...(prev ?? []).filter((v) => !added.some((a) => a.id === v.id))]);
      const failed = res.filter((r) => !r.ok);
      setText(failed.map((r) => r.url).join("\n"));
      setMessage(
        failed.length
          ? { tone: "warning", text: `${added.length}개 추가 · ${failed.length}개 실패: ${failed[0].error ?? "가져오지 못했습니다"}` }
          : { tone: "info", text: `${added.length}개를 이 제품에 연결했습니다.` },
      );
      if (!failed.length) setAdding(false);
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : "가져오지 못했습니다." });
    } finally {
      setImporting(false);
    }
  }

  async function unlink(v: ReferenceVideo) {
    if (!window.confirm(`'${v.title}' 영상을 이 제품에서 연결 해제할까요?\n(영상은 '영상 URL 가져오기' 목록에 그대로 남습니다)`)) return;
    const updated = await api.videos.setProduct(v.id, null);
    list.setData((prev) => prev?.map((x) => (x.id === v.id ? updated : x)) ?? null);
  }

  return (
    <SectionCard
      title={`연결된 영상${videos.length ? ` · ${videos.length}개` : ""}`}
      icon={Film}
      description="이 제품에 연결한 참고 영상입니다. 샤오홍슈 영상은 워터마크 없는 원본을 소리 없이 바로 받을 수 있습니다."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {xhs.bulk && <span className="text-xs text-fg-subtle">{xhs.bulk}</span>}
          {xhsVideos.length > 1 && (
            <>
              <Button size="sm" variant="primary" icon={FolderDown} loading={Boolean(xhs.bulk)} disabled={xhs.busy} onClick={() => void xhs.runAll(xhsVideos, "제품영상")}>
                전체 다운로드 (ZIP)
              </Button>
            </>
          )}
          <Button size="sm" variant={adding ? "subtle" : "secondary"} icon={ListPlus} onClick={() => setAdding((v) => !v)}>
            영상 추가
          </Button>
        </div>
      }
      flush
    >
      {adding && (
        <div className="space-y-2 border-b border-line px-5 py-4">
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"샤오홍슈 공유 링크(또는 YouTube 주소)를 한 줄에 하나씩 붙여 넣으세요. 앱의 공유 문구를 통째로 붙여 넣어도 됩니다."}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-fg-subtle">{links.length ? `링크 ${links.length}개${links.length > MAX_BATCH ? ` (한 번에 ${MAX_BATCH}개까지)` : ""}` : "링크를 찾지 못했습니다"}</span>
            <Button size="sm" variant="primary" icon={ListPlus} loading={importing} disabled={!links.length} onClick={() => void handleImport()}>
              이 제품에 연결해 가져오기
            </Button>
          </div>
        </div>
      )}
      {message && (
        <div className="px-5 pt-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {list.loading ? (
        <LoadingState variant="skeleton" rows={2} className="p-5" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !videos.length ? (
        <EmptyState
          compact
          title="연결된 영상이 없습니다"
          description="[영상 추가]로 링크를 넣거나, '영상 URL 가져오기'에서 영상마다 연관 제품을 고르면 여기에 모입니다."
        />
      ) : (
        <ul className="divide-y divide-line">
          {videos.map((v) => {
            const running = xhs.isRunning(v.id);
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <VideoThumb className="h-11 w-20 shrink-0" thumbnailUrl={v.thumbnailUrl} color={v.thumbnailColor} durationSec={v.durationSec} />
                <div className="min-w-0 flex-1">
                  <a href={v.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm font-medium text-fg hover:text-brand">
                    {v.title}
                  </a>
                  <p className="text-xs text-fg-subtle">
                    {PLATFORM_LABEL[v.platform] ?? "기타"} · {v.channelName} · {formatRelative(v.createdAt)}
                    {v.note ? ` · ${v.note}` : ""}
                  </p>
                  <XhsJobStatus job={xhs.jobs[v.id]} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {v.platform === "xiaohongshu" ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Download}
                        loading={running}
                        disabled={Boolean(xhs.bulk)}
                        onClick={() => xhs.runOne(v)}
                        title="워터마크 없는 원본, 소리 없이 바로 저장합니다"
                      >
                        다운로드
                      </Button>
                    </>
                  ) : (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-[13px] text-fg-muted hover:bg-subtle hover:text-fg"
                    >
                      <ExternalLink className="size-3.5" />
                      원본 보기
                    </a>
                  )}
                  <IconButton icon={Unlink} label="이 제품에서 연결 해제" size="sm" disabled={running} onClick={() => void unlink(v)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line px-5 py-2.5 text-right">
        <Link href="/tools/video-import" className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-brand">
          영상 URL 가져오기에서 전체 보기
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </SectionCard>
  );
}
