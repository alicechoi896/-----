"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download, ExternalLink, Film, FolderDown, Link2, ListPlus, Unlink } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { PLATFORM_LABEL, canDirectDownload, parseVideoLinks } from "@/lib/video-links";
import { Badge, Button, EmptyState, ErrorState, IconButton, Input, LoadingState, Notice, SectionCard, Textarea } from "@/components/ui";
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
  const list = useAsync(() => api.videos.list(productId), [productId]);
  const xhs = useXhsDownloads();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string } | null>(null);

  const videos = (list.data ?? []).filter((v) => v.productId === productId);
  const xhsVideos = videos.filter((v) => canDirectDownload(v.platform));
  // v0.9.113: 샤오홍슈 공유 링크(xhslink)는 몇 년이 지나도 열려 영상 제작·새벽 자동 제작에 그대로 쓴다. 검색으로 가져온 긴 주소는 열쇠가 만료된다
  const isShort = (url: string) => /^https?:\/\/([a-z0-9-]+\.)*xhslink\.com\//i.test(url);
  const linkOf = (v: ReferenceVideo) => v.shareUrl || v.url;
  const expiring = videos.filter((v) => v.platform === "xiaohongshu" && !isShort(linkOf(v)));
  // v0.9.114: TikHub 상세 1회(약 $0.01)로 영구 공유 링크 찾기 — 확인 후, 하루 한도
  const [tk, setTk] = useState<{ busy: string | null; usage: { calls: number; limit: number } | null; note: string | null }>({ busy: null, usage: null, note: null });
  async function viaTikhub(targets: ReferenceVideo[]) {
    if (!targets.length) return;
    const usd = (targets.length * 0.01).toFixed(2);
    if (!window.confirm(`TikHub 로 영구 공유 링크를 찾습니다: ${targets.length}개 × 약 $0.01 = 약 ${usd} (하루 한도 $0.5 = 50회, 넘으면 멈춤). 진행할까요?`)) return;
    let ok = 0;
    let firstMiss: string | null = null;
    for (const [i, v] of targets.entries()) {
      setTk((s) => ({ ...s, busy: v.id, note: `TikHub 로 찾는 중 ${i + 1}/${targets.length}…` }));
      try {
        const r = await api.videos.shareLinkViaTikhub(v.id);
        setTk((s) => ({ ...s, usage: r.usage }));
        if (r.saved) {
          ok++;
          list.setData((prev) => prev?.map((x) => (x.id === v.id ? { ...x, shareUrl: r.saved } : x)) ?? null);
          setRelinkMsg((m) => ({ ...m, [v.id]: { ok: true, text: "영구 링크를 받았습니다 (TikHub)" } }));
        } else {
          firstMiss ??= r.others.length ? `TikHub 응답에 xhslink 가 없었습니다. 받은 공유 관련 값: ${r.others.join(" / ")}` : "TikHub 응답에 공유 링크가 없었습니다.";
          setRelinkMsg((m) => ({ ...m, [v.id]: { ok: false, text: "TikHub 응답에 영구 링크가 없습니다" } }));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "실패";
        setRelinkMsg((m) => ({ ...m, [v.id]: { ok: false, text: msg } }));
        if (/한도|BUDGET|연결되어 있지/.test(msg)) {
          firstMiss = msg;
          break;
        }
      }
    }
    setTk((s) => ({ ...s, busy: null, note: `${ok}/${targets.length}개 영구 링크를 받았습니다.${firstMiss ? ` ${firstMiss}` : ""}` }));
  }
  const [relink, setRelink] = useState<{ id: string; url: string } | null>(null);
  const [relinkBusy, setRelinkBusy] = useState(false);
  const [relinkMsg, setRelinkMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  async function saveRelink() {
    if (!relink) return;
    setRelinkBusy(true);
    try {
      const v = await api.videos.relink(relink.id, relink.url);
      list.setData((prev) => prev?.map((x) => (x.id === v.id ? v : x)) ?? null);
      setRelinkMsg((m) => ({ ...m, [v.id]: { ok: true, text: "공유 링크로 바꿨습니다 (영구)" } }));
      setRelink(null);
    } catch (e) {
      setRelinkMsg((m) => ({ ...m, [relink.id]: { ok: false, text: e instanceof Error ? e.message : "바꾸지 못했습니다." } }));
    } finally {
      setRelinkBusy(false);
    }
  }
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
                  {v.platform === "xiaohongshu" && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]" data-xhs-link>
                      {isShort(linkOf(v)) ? (
                        <Badge tone="success">영구 링크 ✓ (xhslink)</Badge>
                      ) : (
                        <>
                          <Badge tone="warning">만료되는 링크</Badge>
                          <Button size="sm" variant="ghost" icon={Link2} className="h-7 px-2 text-[12px]" onClick={() => setRelink({ id: v.id, url: "" })} data-xhs-relink>
                            공유 링크 직접 넣기
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" loading={tk.busy === v.id} disabled={Boolean(tk.busy)} onClick={() => void viaTikhub([v])} data-xhs-tikhub>
                            영구 링크 받기 (TikHub ≈$0.01)
                          </Button>
                        </>
                      )}
                      {relinkMsg[v.id] && <span className={relinkMsg[v.id].ok ? "text-success" : "text-danger"}>{relinkMsg[v.id].text}</span>}
                    </div>
                  )}
                  {relink?.id === v.id && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Input value={relink.url} onChange={(e) => setRelink({ id: v.id, url: e.target.value })} placeholder="샤오홍슈 앱 › [공유] › 링크 복사 (http://xhslink.com/o/…) — 공유 문구 통째로 붙여 넣어도 됩니다" className="h-8 flex-1 text-[12.5px]" aria-label="공유 링크" />
                      <Button size="sm" variant="primary" loading={relinkBusy} disabled={!relink.url.trim()} onClick={() => void saveRelink()}>
                        바꾸기
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRelink(null)}>
                        취소
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canDirectDownload(v.platform) ? (
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
      {expiring.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-2.5">
          <Button size="sm" variant="secondary" loading={Boolean(tk.busy)} disabled={Boolean(tk.busy)} onClick={() => void viaTikhub(expiring)} data-xhs-tikhub-all>
            만료 링크 {expiring.length}개 모두 영구 링크 받기 (TikHub ≈${(expiring.length * 0.01).toFixed(2)})
          </Button>
          <span className="text-[12px] text-fg-subtle">
            {tk.usage ? `오늘 TikHub ${tk.usage.calls}/${tk.usage.limit}회` : "하루 한도 $0.5 (50회)"}
            {tk.note ? ` · ${tk.note}` : ""}
          </span>
        </div>
      )}
      {expiring.length > 0 && (
        <p className="border-t border-line px-5 py-2 text-[12px] text-warning">
          만료되는 링크 {expiring.length}개 — 검색으로 가져온 주소는 시간이 지나면 열리지 않습니다. 샤오홍슈 앱에서 그 영상의 [공유] → 링크 복사(xhslink.com) 주소로 바꾸면 계속 쓸 수 있습니다 (새벽 자동 제작은 공유 링크 영상만 씁니다).
        </p>
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
