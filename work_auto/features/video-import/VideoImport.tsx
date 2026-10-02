"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CircleCheck, Copy, Download, FolderDown, ListPlus, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { downloadBlob } from "@/lib/photo-process";
import { DOWNLOAD_DIR, INSTALL_COMMANDS, downloadCommand } from "@/lib/video-download";
import { PLATFORM_LABEL, parseVideoLinks } from "@/lib/video-links";
import { downloadXhsMuted, type XhsStage } from "@/lib/xhs-download";
import { createZip } from "@/lib/zip";
import {
  Badge,
  Button,
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
  Textarea,
  type Column,
} from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { cn, formatRelative } from "@/lib/utils";

const MAX_BATCH = 20;

type ImportResult = { url: string; ok: boolean; error?: string };

/** 샤오홍슈 다운로드 진행 상태 (행마다) */
type Job = { stage: XhsStage | "error"; progress?: number; error?: string };

const STAGE_LABEL: Record<XhsStage, string> = {
  resolve: "영상 찾는 중",
  download: "받는 중",
  mute: "소리 빼는 중",
  done: "저장 완료",
};

/**
 * 영상 URL 가져오기.
 * - URL 여러 개를 줄바꿈으로 넣으면 한 번에 목록이 생긴다. 샤오홍슈 앱의 공유 문구를 그대로 붙여넣어도 링크·제목을 뽑는다
 * - 샤오홍슈 [다운로드]: 사이트에서 바로 소리 없는 mp4 로 저장 (서버는 영상 주소만 찾고, 파일은 브라우저가 직접 받아 소리를 뺀다)
 * - YouTube [다운로드]: 서버에서 받을 수 없어(봇 차단) 내 PC 에서 실행할 yt-dlp 명령을 복사한다
 */
export function VideoImport() {
  const list = useAsync(() => api.videos.list(), []);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [bulk, setBulk] = useState<string | null>(null);

  const links = parseVideoLinks(text);
  const urls = links.map((l) => l.url);
  const videos = list.data ?? [];
  const xhsVideos = videos.filter((v) => v.platform === "xiaohongshu");
  const otherVideos = videos.filter((v) => v.platform !== "xiaohongshu");
  const busy = Object.values(jobs).some((j) => j.stage === "resolve" || j.stage === "download" || j.stage === "mute");

  async function handleImport() {
    if (!urls.length) return;
    setImporting(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.videos.importMany(links.slice(0, MAX_BATCH), note);
      const added = res.filter((r) => r.ok && r.video).map((r) => r.video!);
      list.setData((prev) => [...added, ...(prev ?? [])]);
      setResults(res.map(({ url, ok, error: e }) => ({ url, ok, error: e })));
      // 실패한 URL 만 입력칸에 남겨 다시 시도할 수 있게
      setText(res.filter((r) => !r.ok).map((r) => r.url).join("\n"));
      if (res.every((r) => r.ok)) setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "가져오기에 실패했습니다.");
    } finally {
      setImporting(false);
    }
  }

  async function handleRemove(v: ReferenceVideo) {
    await api.videos.remove(v.id);
    list.setData((prev) => prev?.filter((x) => x.id !== v.id) ?? null);
  }

  /** 샤오홍슈 1개: 받아서 소리 빼기. save=false 면 저장하지 않고 결과만 돌려준다 (ZIP 용) */
  async function runXhs(v: ReferenceVideo, save = true): Promise<{ blob: Blob; name: string } | null> {
    const set = (job: Job) => setJobs((prev) => ({ ...prev, [v.id]: job }));
    try {
      const out = await downloadXhsMuted(v.url, (stage, progress) => set({ stage, progress }));
      if (save) downloadBlob(out.blob, out.name);
      set({ stage: "done" });
      return out;
    } catch (e) {
      set({ stage: "error", error: e instanceof Error ? e.message : "받지 못했습니다." });
      return null;
    }
  }

  /** 샤오홍슈 여러 개: 하나씩 받아 ZIP 하나로 저장 */
  async function runAllXhs() {
    const results: { blob: Blob; name: string }[] = [];
    for (const [i, v] of xhsVideos.entries()) {
      setBulk(`샤오홍슈 ${i + 1}/${xhsVideos.length} 처리 중…`);
      const out = await runXhs(v, false);
      if (out) results.push(out);
    }
    setBulk(null);
    if (results.length === 1) downloadBlob(results[0].blob, results[0].name);
    else if (results.length > 1) {
      // 이름이 겹치면 번호를 붙인다
      const seen = new Map<string, number>();
      const files = results.map((r) => {
        const n = (seen.get(r.name) ?? 0) + 1;
        seen.set(r.name, n);
        return { name: n > 1 ? r.name.replace(/\.mp4$/, ` (${n}).mp4`) : r.name, blob: r.blob };
      });
      downloadBlob(await createZip(files), `샤오홍슈_음성없음_${files.length}개.zip`);
    }
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
            <p className="text-xs text-fg-subtle">
              {PLATFORM_LABEL[v.platform] ?? "기타"} · {v.channelName}
            </p>
            <JobStatus job={jobs[v.id]} />
          </div>
        </div>
      ),
    },
    { key: "note", header: "메모", render: (v) => <span className="text-fg-muted">{v.note ?? "-"}</span> },
    { key: "createdAt", header: "가져온 시각", render: (v) => <span className="whitespace-nowrap text-fg-muted">{formatRelative(v.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (v) => {
        const job = jobs[v.id];
        const running = job && (job.stage === "resolve" || job.stage === "download" || job.stage === "mute");
        return (
          <div className="flex items-center justify-end gap-1">
            {v.platform === "xiaohongshu" ? (
              <Button size="sm" variant="primary" icon={Download} loading={Boolean(running)} disabled={Boolean(bulk)} onClick={() => void runXhs(v)} title="소리 없는 mp4 로 바로 저장합니다">
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
            <IconButton icon={Trash2} label="삭제" disabled={Boolean(running)} onClick={() => handleRemove(v)} className="hover:text-danger" />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="영상 가져오기"
        icon={ListPlus}
        description="샤오홍슈·YouTube 영상 링크를 한 줄에 하나씩 넣으세요. 샤오홍슈 앱의 공유 문구를 그대로 붙여넣어도 됩니다. 한 번에 20개까지."
      >
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
              placeholder={"샤오홍슈 앱 → 공유 → 링크 복사 문구를 그대로 붙여넣기\nhttps://www.xiaohongshu.com/discovery/item/…?xsec_token=…\nhttps://www.youtube.com/shorts/…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </FormField>
          <div className="grid items-end gap-3 md:grid-cols-[1fr_auto]">
            <FormField label="메모 (모든 영상에 같이 저장)" htmlFor="video-note" optional>
              <Input id="video-note" placeholder="예: Hook 구성 참고" value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <Button type="submit" variant="primary" icon={ListPlus} loading={importing} disabled={!urls.length}>
              {urls.length > 1 ? `${Math.min(urls.length, MAX_BATCH)}개 가져오기` : "가져오기"}
            </Button>
          </div>
        </form>
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
        title="저장된 참고 영상"
        description="샤오홍슈는 [다운로드]를 누르면 소리 없는 mp4 로 바로 저장됩니다. 영상은 우리 서버에 저장되지 않습니다."
        flush
        actions={
          <div className="flex items-center gap-2">
            {bulk && <span className="text-xs text-fg-subtle">{bulk}</span>}
            {xhsVideos.length > 1 && (
              <Button size="sm" variant="primary" icon={FolderDown} loading={Boolean(bulk)} disabled={busy} onClick={() => void runAllXhs()}>
                샤오홍슈 {xhsVideos.length}개 한 번에 받기 (ZIP)
              </Button>
            )}
          </div>
        }
      >
        {list.loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : (
          <DataTable columns={columns} rows={videos} rowKey={(v) => v.id} empty={<EmptyState compact title="가져온 영상이 없습니다" />} />
        )}
      </SectionCard>

      <Notice tone="neutral" icon={ShieldCheck} title="저작권 주의">
        내 영상, 사용 허락을 받은 영상(제조사·판매자 제공 소스 등), 또는 참고(분석)용으로만 쓰세요. 다른 사람 영상은 소리를 빼고 다시 올려도 플랫폼이
        화면으로 찾아내 수익 정지·저작권 경고를 받을 수 있습니다.
      </Notice>

      {otherVideos.length > 0 && (
        <YouTubeGuide open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} command={downloadCommand(otherVideos.map((v) => v.url))} count={otherVideos.length} />
      )}
    </div>
  );
}

function JobStatus({ job }: { job?: Job }) {
  if (!job) return null;
  if (job.stage === "error") return <p className="mt-0.5 text-xs text-danger">{job.error}</p>;
  if (job.stage === "done")
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
        <CircleCheck className="size-3.5" />
        소리 없는 영상으로 저장했습니다
      </p>
    );
  const pct = job.progress != null ? Math.round(job.progress * 100) : null;
  return (
    <div className="mt-1 flex items-center gap-2">
      <Badge tone="brand">
        {STAGE_LABEL[job.stage]}
        {pct != null && job.stage !== "resolve" ? ` ${pct}%` : ""}
      </Badge>
      {pct != null && (
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
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
            YouTube 는 서버에서 받으면 봇 확인으로 막혀서, 내 PC 에서 받는 명령을 드립니다. (샤오홍슈는 이 과정 없이 [다운로드] 버튼으로 바로 됩니다)
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
          <p className="text-xs text-fg-subtle">
            이미 소리 있는 파일을 갖고 있다면{" "}
            <Link href="/tools/video-mute" className="font-medium text-brand hover:underline">
              영상 음성 제거
            </Link>
            에 넣어도 됩니다.
          </p>
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
