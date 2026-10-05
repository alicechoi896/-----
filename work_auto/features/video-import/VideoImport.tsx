"use client";

import { useState } from "react";
import { Check, Copy, Download, FolderDown, History, ListPlus, ShieldCheck, Sparkles, Terminal, Trash2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { DOWNLOAD_DIR, INSTALL_COMMANDS, downloadCommand } from "@/lib/video-download";
import { PLATFORM_LABEL, canDirectDownload, parseVideoLinks } from "@/lib/video-links";
import {
  Button,
  Combobox,
  CopyButton,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Notice,
  SectionCard,
  SegmentedControl,
  Textarea,
  type Column,
} from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { cn, formatRelative } from "@/lib/utils";
import { XhsJobStatus, useXhsDownloads } from "./useXhsDownloads";
import { SocialSearchPanel } from "./SocialSearchPanel";

const MAX_BATCH = 20;

type ImportResult = { url: string; ok: boolean; error?: string };

const PLATFORM_BADGE: Partial<Record<ReferenceVideo["platform"], string>> = {
  xiaohongshu: "bg-[#ff2442] text-white",
  douyin: "bg-[#161823] text-white",
  youtube: "bg-[#ff0000] text-white",
};

/**
 * 영상 URL 가져오기.
 * - URL 여러 개를 줄바꿈으로 넣으면 한 번에 목록이 생긴다. 샤오홍슈·도우인 앱의 공유 문구를 그대로 붙여넣어도 링크·제목을 뽑는다
 * - [영상 검색] 탭: 샤오홍슈 또는 도우인 (TikHub, 검색 1번 = 1회). 가져오기는 URL 가져오기와 같은 함수 (검색 결과 메타로 저장, 상세 API 없음)
 * - 처음 열 때 저장된 영상 전체를 부르지 않는다: '이번에 가져온 영상'만 보이고, 기존 영상은 제품을 골라야 불러온다
 * - 샤오홍슈·도우인 [다운로드]: 사이트에서 바로 소리 없는 mp4 로 저장 (서버는 영상 주소만 찾고, 파일은 브라우저가 직접 받아 소리를 뺀다)
 * - YouTube [다운로드]: 서버에서 받을 수 없어(봇 차단) 내 PC 에서 실행할 yt-dlp 명령을 복사한다
 */
export function VideoImport() {
  const products = useAsync(() => api.products.list(), []);
  const [productId, setProductId] = useState("");
  // 기존 참고 영상: "" = 아직 안 고름(부르지 않음) / "all" 전체 / "none" 제품 미연결 / 제품 id
  const [existingFilter, setExistingFilter] = useState("");
  // 30개씩 읽고 [더 불러오기]를 누를 때만 다음 30개 (DB 읽기·화면 부하 줄이기)
  const existing = useAsync(
    () => (existingFilter ? api.videos.page(existingFilter) : Promise.resolve({ items: [] as ReferenceVideo[], hasMore: false, nextOffset: 0 })),
    [existingFilter],
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  async function loadMoreExisting() {
    const cur = existing.data;
    if (!cur?.hasMore || !existingFilter) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await api.videos.page(existingFilter, cur.nextOffset);
      existing.setData((prev) => {
        const seen = new Set((prev?.items ?? []).map((v) => v.id));
        return { items: [...(prev?.items ?? []), ...next.items.filter((v) => !seen.has(v.id))], hasMore: next.hasMore, nextOffset: next.nextOffset };
      });
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : "더 불러오지 못했습니다.");
    } finally {
      setLoadingMore(false);
    }
  }
  // 이번에 가져온 영상 (이 화면을 연 뒤 가져온 것만, 저장은 이미 됐다)
  const [session, setSession] = useState<ReferenceVideo[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 체크해서 고른 영상 (표마다 따로, 전체 선택은 표 머리의 체크 상자)
  const [sessionSel, setSessionSel] = useState<Set<string>>(new Set());
  const [existingSel, setExistingSel] = useState<Set<string>>(new Set());
  // 가져오기 방식: 기존 URL 입력(기본) / 영상 검색 (TikHub)
  const [mode, setMode] = useState<"url" | "search">("url");
  const xhs = useXhsDownloads();
  const { jobs, bulk, busy } = xhs;

  const links = parseVideoLinks(text);
  const urls = links.map((l) => l.url);
  const existingRows = existingFilter ? (existing.data?.items ?? []).filter((v) => !session.some((s) => s.id === v.id)) : [];
  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name, description: [p.brand, p.category].filter(Boolean).join(" · ") }));
  const youtubeAll = [...session, ...existingRows].filter((v) => !canDirectDownload(v.platform));

  /** 가져오기 결과 반영 (URL 입력·영상 검색 공통) */
  function applyImported(res: { url: string; ok: boolean; video?: ReferenceVideo; error?: string }[]) {
    const added = res.filter((r) => r.ok && r.video).map((r) => r.video!);
    setSession((prev) => [...added, ...prev.filter((v) => !added.some((a) => a.id === v.id))]);
    setResults(res.map(({ url, ok, error: e }) => ({ url, ok, error: e })));
  }

  async function handleImport() {
    if (!urls.length) return;
    setImporting(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.videos.importMany(links.slice(0, MAX_BATCH), note, productId || null);
      applyImported(res);
      // 실패한 URL 만 입력칸에 남겨 다시 시도할 수 있게
      setText(res.filter((r) => !r.ok).map((r) => r.url).join("\n"));
      if (res.every((r) => r.ok)) setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  }

  const patchEverywhere = (id: string, fn: (v: ReferenceVideo) => ReferenceVideo | null) => {
    setSession((prev) => prev.flatMap((v) => (v.id === id ? (fn(v) ?? []) : [v])));
    existing.setData((prev) => (prev ? { ...prev, items: prev.items.flatMap((v) => (v.id === id ? (fn(v) ?? []) : [v])) } : null));
  };

  async function changeProduct(v: ReferenceVideo, next: string) {
    const updated = await api.videos.setProduct(v.id, next || null);
    patchEverywhere(v.id, () => updated);
  }

  async function handleRemove(v: ReferenceVideo) {
    await api.videos.remove(v.id);
    patchEverywhere(v.id, () => null);
  }

  async function copyCommand(v: ReferenceVideo) {
    try {
      await navigator.clipboard.writeText(downloadCommand([v.url]));
      setCopiedId(v.id);
      setTimeout(() => setCopiedId((id) => (id === v.id ? null : id)), 1800);
    } finally {
      setGuideOpen(true);
    }
  }

  /** 고른 영상 한 번에: 샤오홍슈·도우인은 ZIP 으로 받고, YouTube 는 내 PC 에서 받는 명령 하나로 복사 */
  async function downloadPicked(picked: ReferenceVideo[], key: string) {
    const other = picked.filter((v) => !canDirectDownload(v.platform));
    const direct = picked.filter((v) => canDirectDownload(v.platform));
    if (other.length) {
      await navigator.clipboard.writeText(downloadCommand(other.map((v) => v.url))).catch(() => undefined);
      setCopiedId(key);
      setGuideOpen(true);
      setTimeout(() => setCopiedId((id) => (id === key ? null : id)), 2500);
    }
    if (direct.length) await xhs.runAll(direct, "참고영상");
  }

  const columns: Column<ReferenceVideo>[] = [
    {
      key: "title",
      header: "영상",
      render: (v) => (
        <div className="flex items-center gap-3">
          <VideoThumb className="h-11 w-20" thumbnailUrl={v.thumbnailUrl} color={v.thumbnailColor} durationSec={v.durationSec} />
          <div className="min-w-0">
            <a href={v.url} target="_blank" rel="noreferrer" className="line-clamp-1 font-medium text-fg hover:text-brand">
              {v.title}
            </a>
            <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
              <span className={cn("rounded px-1 py-px text-[10px] font-semibold", PLATFORM_BADGE[v.platform] ?? "bg-muted text-fg-muted")}>{PLATFORM_LABEL[v.platform] ?? "기타"}</span>
              <span className="truncate">{v.channelName}</span>
            </p>
            <XhsJobStatus job={jobs[v.id]} />
          </div>
        </div>
      ),
    },
    {
      key: "product",
      header: "연관 제품",
      width: "200px",
      render: (v) => (
        <Combobox
          className="w-[190px]"
          value={v.productId ?? ""}
          options={productOptions}
          placeholder="제품 연결 안 함"
          searchPlaceholder="제품 이름·브랜드로 검색"
          emptyText={productOptions.length ? "검색 결과가 없습니다" : "저장된 제품이 없습니다"}
          onChange={(next) => void changeProduct(v, next)}
        />
      ),
    },
    { key: "note", header: "메모", render: (v) => <span className="text-fg-muted">{v.note ?? "-"}</span> },
    { key: "createdAt", header: "가져온 시각", render: (v) => <span className="whitespace-nowrap text-fg-muted">{formatRelative(v.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (v) => {
        const running = xhs.isRunning(v.id);
        return (
          <div className="flex items-center justify-end gap-1">
            {canDirectDownload(v.platform) ? (
              <Button
                size="sm"
                variant="primary"
                icon={Download}
                loading={running}
                disabled={Boolean(bulk)}
                onClick={() => xhs.runOne(v)}
                title={v.platform === "douyin" ? "도우인 영상을 소리 없이 바로 저장합니다 (워터마크 여부는 원본에 따름)" : "워터마크 없는 원본, 소리 없이 바로 저장합니다"}
              >
                다운로드
              </Button>
            ) : (
              <Button
                size="sm"
                variant={copiedId === v.id ? "subtle" : "secondary"}
                icon={copiedId === v.id ? Check : Terminal}
                onClick={() => void copyCommand(v)}
                title="YouTube 는 내 PC 에서 받아야 합니다. 받는 명령을 복사합니다"
              >
                {copiedId === v.id ? "명령 복사됨" : "다운로드 명령"}
              </Button>
            )}
            <IconButton icon={Trash2} label="삭제" disabled={running} onClick={() => handleRemove(v)} className="hover:text-danger" />
          </div>
        );
      },
    },
  ];

  /** 표 위 [선택한 N개 받기] / [바로 받기 전체 N개] */
  function bulkActions(rows: ReferenceVideo[], sel: Set<string>, clear: () => void, key: string) {
    const picked = rows.filter((v) => sel.has(v.id));
    const direct = rows.filter((v) => canDirectDownload(v.platform));
    return (
      <>
        {bulk && <span className="text-xs text-fg-subtle">{bulk}</span>}
        {picked.length > 0 ? (
          <>
            <Button size="sm" variant="ghost" onClick={clear}>
              선택 해제
            </Button>
            <Button size="sm" variant="primary" icon={FolderDown} loading={Boolean(bulk)} disabled={busy} onClick={() => void downloadPicked(picked, key)}>
              {copiedId === key ? "YouTube 명령 복사됨" : `선택한 ${picked.length}개 받기${picked.filter((v) => canDirectDownload(v.platform)).length > 1 ? " (ZIP)" : ""}`}
            </Button>
          </>
        ) : (
          direct.length > 1 && (
            <Button size="sm" variant="primary" icon={FolderDown} loading={Boolean(bulk)} disabled={busy} onClick={() => void xhs.runAll(direct, "참고영상")}>
              샤오홍슈·도우인 {direct.length}개 받기 (ZIP)
            </Button>
          )
        )}
      </>
    );
  }

  const existingLabel =
    existingFilter === "all" ? "전체 제품" : existingFilter === "none" ? "제품 미연결" : (productOptions.find((p) => p.value === existingFilter)?.label ?? "");

  return (
    <div className="space-y-5">
      <SectionCard
        title="영상 가져오기"
        icon={ListPlus}
        description={
          mode === "url"
            ? "샤오홍슈·도우인·YouTube 영상 링크를 한 줄에 하나씩 넣으세요. 샤오홍슈·도우인 앱의 공유 문구를 그대로 붙여넣어도 됩니다 (v.douyin.com 링크 포함). 한 번에 20개까지."
            : "샤오홍슈·도우인에서 영상을 검색해 골라 가져옵니다 (TikHub API). 가져온 영상은 아래 '이번에 가져온 영상'에 들어갑니다."
        }
        actions={
          <SegmentedControl
            size="sm"
            options={[
              { value: "url", label: "URL로 가져오기" },
              { value: "search", label: "영상 검색" },
            ]}
            value={mode}
            onChange={setMode}
          />
        }
      >
        {mode === "search" ? (
          <SocialSearchPanel productOptions={productOptions} productsLoading={products.loading} maxBatch={MAX_BATCH} onImported={applyImported} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleImport();
            }}
          >
            <FormField
              label={`영상 URL · ${urls.length}개`}
              htmlFor="video-urls"
              error={error}
              hint={urls.length > MAX_BATCH ? `한 번에 ${MAX_BATCH}개까지 가져옵니다. 나머지는 다음에 다시 가져오세요.` : "엔터로 구분합니다."}
            >
              <Textarea
                id="video-urls"
                rows={4}
                placeholder={"샤오홍슈·도우인 앱 → 공유 → 링크 복사 문구를 그대로 붙여넣기\nhttps://v.douyin.com/…/\nhttps://www.xiaohongshu.com/discovery/item/…?xsec_token=…\nhttps://www.youtube.com/shorts/…"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </FormField>
            <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <FormField label="연관 제품 (모든 영상에 같이 저장)" htmlFor="video-product" optional>
                <Combobox
                  id="video-product"
                  value={productId}
                  options={productOptions}
                  placeholder={products.loading ? "불러오는 중…" : "제품 연결 안 함"}
                  searchPlaceholder="제품 이름·브랜드로 검색"
                  emptyText={productOptions.length ? "검색 결과가 없습니다" : "저장된 제품이 없습니다"}
                  onChange={setProductId}
                />
              </FormField>
              <FormField label="메모 (모든 영상에 같이 저장)" htmlFor="video-note" optional>
                <Input id="video-note" placeholder="예: Hook 구성 참고" value={note} onChange={(e) => setNote(e.target.value)} />
              </FormField>
              <Button type="submit" variant="primary" icon={ListPlus} loading={importing} disabled={!urls.length}>
                {urls.length > 1 ? `${Math.min(urls.length, MAX_BATCH)}개 가져오기` : "가져오기"}
              </Button>
            </div>
          </form>
        )}
        {results && (
          <ul className="mt-3 space-y-1 text-xs">
            <li className="font-medium text-fg-muted">
              {results.filter((r) => r.ok).length}개 추가 · {results.filter((r) => !r.ok).length}개 실패
            </li>
            {results
              .filter((r) => !r.ok)
              .map((r) => (
                <li key={r.url} className="text-danger">
                  {r.url} — {r.error}
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={`이번에 가져온 영상${session.length ? ` · ${session.length}개` : ""}`}
        icon={Sparkles}
        description="이 화면에서 방금 가져온 영상입니다 (이미 저장됐습니다). 샤오홍슈·도우인 [다운로드] = 소리 없이 바로 저장. 영상은 우리 서버에 저장되지 않습니다."
        flush
        actions={<div className="flex items-center gap-2">{bulkActions(session, sessionSel, () => setSessionSel(new Set()), "__session")}</div>}
      >
        <DataTable
          columns={columns}
          rows={session}
          rowKey={(v) => v.id}
          selection={{ selected: sessionSel, onChange: setSessionSel }}
          empty={<EmptyState compact title="아직 이번에 가져온 영상이 없습니다" description="위에서 URL 을 넣거나 영상을 검색해 가져오세요." />}
        />
      </SectionCard>

      <SectionCard
        title="기존 참고 영상"
        icon={History}
        description="예전에 가져온 영상은 제품을 골라야 불러옵니다 (처음 열 때 전체를 불러오지 않습니다). 30개씩 보입니다."
        flush
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Combobox
              className="w-52"
              value={existingFilter}
              options={[{ value: "all", label: "전체 제품" }, { value: "none", label: "제품 미연결" }, ...productOptions]}
              placeholder="제품을 선택하세요"
              searchPlaceholder="제품으로 보기"
              onChange={(v) => {
                setExistingFilter(v);
                setExistingSel(new Set());
              }}
            />
            {existingFilter && bulkActions(existingRows, existingSel, () => setExistingSel(new Set()), "__existing")}
          </div>
        }
      >
        {!existingFilter ? (
          <EmptyState compact title="제품을 선택하세요" description="제품을 고르면 그 제품에 연결된 영상을 불러옵니다. 전체 제품·제품 미연결도 고를 수 있습니다." />
        ) : existing.loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : existing.error ? (
          <ErrorState message={existing.error} onRetry={existing.reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={existingRows}
            rowKey={(v) => v.id}
            selection={{ selected: existingSel, onChange: setExistingSel }}
            empty={<EmptyState compact title={`'${existingLabel}' 영상이 없습니다`} />}
          />
        )}
        {existingFilter && existing.data?.hasMore && (
          <div className="flex items-center justify-center gap-3 border-t border-line px-5 py-3">
            {moreError && <span className="text-xs text-danger">{moreError}</span>}
            <Button size="sm" variant="ghost" loading={loadingMore} onClick={() => void loadMoreExisting()}>
              더 불러오기 (30개)
            </Button>
          </div>
        )}
      </SectionCard>

      <Notice tone="neutral" icon={ShieldCheck} title="저작권 주의">
        내 영상, 사용 허락을 받은 영상(제조사·판매자 제공 소스 등), 또는 참고(분석)용으로만 쓰세요. 다른 사람 영상은 소리를 빼고 다시 올려도 플랫폼이
        화면으로 찾아내 수익 정지·저작권 경고를 받을 수 있습니다. 도우인 영상은 워터마크가 없다고 보장하지 않습니다.
      </Notice>

      {youtubeAll.length > 0 && (
        <YouTubeGuide open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} command={downloadCommand(youtubeAll.map((v) => v.url))} count={youtubeAll.length} />
      )}
    </div>
  );
}

/** YouTube 는 서버에서 받을 수 없어(봇 차단) 내 PC 에서 받는다 */
function YouTubeGuide({ open, onToggle, command, count }: { open: boolean; onToggle: () => void; command: string; count: number }) {
  return (
    <section className="rounded-card border border-line bg-subtle/60">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <Terminal className="size-4 text-fg-subtle" />
          YouTube 영상 받는 방법 (내 PC 에서, 소리 없이)
        </span>
        <span className="text-xs text-fg-subtle">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
          <p>
            YouTube 는 서버에서 받으면 봇 확인으로 막혀서, 내 PC 에서 받는 명령을 드립니다. (샤오홍슈·도우인은 이 과정 없이 [다운로드] 버튼으로 바로 됩니다)
          </p>
          <ol className="space-y-3">
            <Step n={1} title="처음 한 번만: PowerShell 에서 설치">
              시작 메뉴 → <b>PowerShell</b> → 아래 두 줄을 하나씩 붙여넣고 Enter. 끝나면 PowerShell 을 닫았다가 다시 엽니다.
              {INSTALL_COMMANDS.map((c) => (
                <Code key={c} text={c} />
              ))}
            </Step>
            <Step n={2} title="영상 옆 [다운로드 명령] 또는 아래 전체 명령 복사 → PowerShell 에 붙여넣고 Enter">
              <span>
                <code className="rounded bg-canvas px-1 ring-1 ring-line">{DOWNLOAD_DIR.replace("~", "내 폴더")}</code> 에 소리 없는 영상이 저장됩니다.
              </span>
              <div className="mt-1.5">
                <CopyButton value={command} label={`YouTube ${count}개 전체 명령 복사`} className="border border-line bg-canvas" />
              </div>
            </Step>
          </ol>
        </div>
      )}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fg text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 space-y-1.5">
        <p className="font-medium text-fg">{title}</p>
        <div>{children}</div>
      </div>
    </li>
  );
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-control bg-fg px-3 py-2 font-mono text-xs text-white">
      <span className="min-w-0 flex-1 truncate">{text}</span>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]", copied ? "text-success" : "text-white/70 hover:bg-white/10 hover:text-white")}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}
