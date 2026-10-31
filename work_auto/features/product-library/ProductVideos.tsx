"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Archive, Download, ExternalLink, Film, FolderDown, Link2, ListPlus, Unlink, Upload } from "lucide-react";
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
  // v0.9.112 영상 파일 보관함: 보관된 파일은 링크가 만료돼도 영상 제작·새벽 자동 제작에 쓴다 (TikHub 없이)
  const [vault, setVault] = useState<Record<string, boolean>>({});
  const [vaultBusy, setVaultBusy] = useState<string | null>(null);
  const [vaultMsg, setVaultMsg] = useState<Record<string, string>>({});
  const [relink, setRelink] = useState<{ id: string; url: string } | null>(null);
  const fileFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = xhsVideos.filter((v) => v.platform === "xiaohongshu").map((v) => v.id).join(",");
  useEffect(() => {
    if (!ids) return;
    let alive = true;
    api.videos
      .vaultStatus(ids.split(","))
      .then((s) => alive && setVault(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ids]);
  const notStored = xhsVideos.filter((v) => v.platform === "xiaohongshu" && vault[v.id] === false);
  async function keep(v: ReferenceVideo, url?: string) {
    setVaultBusy(v.id);
    setVaultMsg((m) => ({ ...m, [v.id]: "" }));
    try {
      const r = await api.videos.vaultFetch(v.id, url);
      setVault((s) => ({ ...s, [v.id]: true }));
      setVaultMsg((m) => ({ ...m, [v.id]: `보관했습니다 (${r.sizeMB}MB)` }));
      if (url) {
        list.setData((prev) => prev?.map((x) => (x.id === v.id ? { ...x, url } : x)) ?? null);
        setRelink(null);
      }
      return true;
    } catch (e) {
      setVaultMsg((m) => ({ ...m, [v.id]: e instanceof Error ? e.message : "받지 못했습니다." }));
      return false;
    } finally {
      setVaultBusy(null);
    }
  }
  async function keepAll() {
    let ok = 0;
    for (const [i, v] of notStored.entries()) {
      setMessage({ tone: "info", text: `영상 파일 받아 두는 중 ${i + 1}/${notStored.length}…` });
      if (await keep(v)) ok++;
    }
    setMessage({ tone: ok === notStored.length ? "info" : "warning", text: `${ok}/${notStored.length}개 보관했습니다.${ok < notStored.length ? " 실패한 영상은 [링크 새로 넣기] 또는 [파일 올리기]로 보관해 주세요." : ""}` });
  }
  async function uploadFile(file: File) {
    const id = fileFor.current;
    if (!id) return;
    setVaultBusy(id);
    try {
      await api.videos.vaultUpload(id, file);
      setVault((s) => ({ ...s, [id]: true }));
      setVaultMsg((m) => ({ ...m, [id]: `올린 파일을 보관했습니다 (${Math.round(file.size / 104857.6) / 10}MB)` }));
    } catch (e) {
      setVaultMsg((m) => ({ ...m, [id]: e instanceof Error ? e.message : "올리지 못했습니다." }));
    } finally {
      setVaultBusy(null);
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
          {notStored.length > 0 && (
            <Button size="sm" variant="secondary" icon={Archive} disabled={Boolean(vaultBusy)} onClick={() => void keepAll()} title="샤오홍슈에서 무료로 받아 보관 (TikHub 안 씀)" data-vault-all>
              보관 안 된 영상 파일 받아 두기 ({notStored.length})
            </Button>
          )}
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
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]" data-vault>
                      {vault[v.id] === true ? <Badge tone="success">파일 보관됨 ✓</Badge> : vault[v.id] === false ? <Badge tone="warning">파일 없음</Badge> : null}
                      {vault[v.id] === false && (
                        <>
                          <Button size="sm" variant="ghost" icon={Archive} className="h-7 px-2 text-[12px]" loading={vaultBusy === v.id} disabled={Boolean(vaultBusy)} onClick={() => void keep(v)} data-vault-fetch>
                            파일 받아 두기
                          </Button>
                          <Button size="sm" variant="ghost" icon={Link2} className="h-7 px-2 text-[12px]" disabled={Boolean(vaultBusy)} onClick={() => setRelink({ id: v.id, url: "" })}>
                            링크 새로 넣기
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Upload}
                            className="h-7 px-2 text-[12px]"
                            disabled={Boolean(vaultBusy)}
                            onClick={() => {
                              fileFor.current = v.id;
                              fileInput.current?.click();
                            }}
                          >
                            파일 올리기
                          </Button>
                        </>
                      )}
                      {vaultMsg[v.id] && <span className={vault[v.id] ? "text-success" : "text-danger"}>{vaultMsg[v.id]}</span>}
                    </div>
                  )}
                  {relink?.id === v.id && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Input value={relink.url} onChange={(e) => setRelink({ id: v.id, url: e.target.value })} placeholder="샤오홍슈 앱 › 공유 › 링크 복사한 주소 (같은 영상)" className="h-8 flex-1 text-[12.5px]" aria-label="새 공유 링크" />
                      <Button size="sm" variant="primary" loading={vaultBusy === v.id} disabled={!relink.url.trim()} onClick={() => void keep(v, relink.url.trim())}>
                        넣고 받아 두기
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
      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadFile(f);
        }}
      />
      <p className="border-t border-line px-5 py-2 text-[11.5px] text-fg-subtle">
        파일 보관됨 ✓ 인 영상은 샤오홍슈 링크가 만료돼도 영상 제작·새벽 자동 제작에 그대로 씁니다. 받기는 샤오홍슈 무료 경로만 쓰고(TikHub 안 씀), 막히면 앱에서 공유 링크를 새로 복사해 넣거나 허락받은 mp4 를 올려 주세요.
      </p>
      <div className="border-t border-line px-5 py-2.5 text-right">
        <Link href="/tools/video-import" className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-brand">
          영상 URL 가져오기에서 전체 보기
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </SectionCard>
  );
}
