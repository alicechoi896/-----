"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Download, Film, ListPlus, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { DOWNLOAD_DIR, INSTALL_COMMAND, downloadCommand } from "@/lib/video-download";
import {
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

const PLATFORM = { youtube: "YouTube", naver: "NAVER", other: "기타" } as const;
const MAX_BATCH = 20;

type ImportResult = { url: string; ok: boolean; error?: string };

/** 줄바꿈·공백·쉼표로 나눈 URL 목록 */
function parseUrls(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)))];
}

/**
 * 영상 URL 가져오기.
 * - URL 여러 개를 줄바꿈으로 넣으면 한 번에 목록이 생긴다 (영상 정보만 저장, '제품 홍보 영상 만들기'의 참고 영상)
 * - 다운로드: 내 PC 에서 실행할 yt-dlp 명령을 복사한다 (영상 트랙만 받아 소리 없는 파일). 사이트 서버는 영상 파일을 다루지 않는다.
 */
export function VideoImport() {
  const list = useAsync(() => api.videos.list(), []);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const urls = parseUrls(text);

  async function handleImport() {
    if (!urls.length) return;
    setImporting(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.videos.importMany(urls.slice(0, MAX_BATCH), note);
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

  async function copyDownload(v: ReferenceVideo) {
    try {
      await navigator.clipboard.writeText(downloadCommand([v.url]));
      setCopiedId(v.id);
      setGuideOpen(true);
      setTimeout(() => setCopiedId((id) => (id === v.id ? null : id)), 1800);
    } catch {
      setGuideOpen(true);
    }
  }

  const videos = list.data ?? [];

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
              {PLATFORM[v.platform]} · {v.channelName}
            </p>
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
      render: (v) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant={copiedId === v.id ? "subtle" : "secondary"}
            icon={copiedId === v.id ? Check : Download}
            onClick={() => void copyDownload(v)}
            title="소리 없는 영상으로 받는 명령을 복사합니다"
          >
            {copiedId === v.id ? "명령 복사됨" : "다운로드"}
          </Button>
          <IconButton icon={Trash2} label="삭제" onClick={() => handleRemove(v)} className="hover:text-danger" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard title="영상 가져오기" icon={ListPlus} description="YouTube, NAVER 등 영상 URL 을 한 줄에 하나씩 넣으세요. 한 번에 20개까지 목록에 추가됩니다.">
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
              placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…\nhttps://www.youtube.com/shorts/…"}
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
        icon={Film}
        flush
        actions={
          videos.length > 0 && (
            // 복사하면 아래 다운로드 방법도 펼친다
            <span onClick={() => setGuideOpen(true)}>
              <CopyButton
                value={downloadCommand(videos.map((v) => v.url))}
                label={`전체 ${videos.length}개 다운로드 명령 복사`}
                className="border border-line"
              />
            </span>
          )
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

      <DownloadGuide open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} />
    </div>
  );
}

/** 다운로드 방법 (처음 한 번 설치 → 명령 붙여넣기) */
function DownloadGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <section className="rounded-card border border-line bg-subtle/60">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <Terminal className="size-4 text-fg-subtle" />
          다운로드 방법 (소리 없는 영상으로 저장)
        </span>
        <span className="text-xs text-fg-subtle">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
          <ol className="space-y-3">
            <Step n={1} title="처음 한 번만: 다운로드 도구(yt-dlp) 설치">
              시작 메뉴에서 <b>PowerShell</b> 을 열고 아래 명령을 붙여넣은 뒤 Enter. 설치가 끝나면 PowerShell 을 닫았다가 다시 엽니다.
              <Code text={INSTALL_COMMAND} />
            </Step>
            <Step n={2} title="영상 옆 [다운로드] 또는 [전체 다운로드 명령 복사]">
              소리 없는 영상(영상 트랙만)으로 받는 명령이 복사됩니다.
            </Step>
            <Step n={3} title="PowerShell 에 붙여넣고 Enter">
              <span>
                <code className="rounded bg-canvas px-1 ring-1 ring-line">{DOWNLOAD_DIR.replace("~", "내 폴더")}</code> 에 <b>소리 없는 영상</b>이 저장됩니다.
                파일 이름 끝에 <code className="rounded bg-canvas px-1 ring-1 ring-line">_음성없음</code> 이 붙습니다.
              </span>
            </Step>
          </ol>
          <p className="text-xs text-fg-subtle">
            영상만 따로 제공하지 않는 일부 사이트는 받기가 실패할 수 있습니다. 그럴 때는 일반 파일로 받은 뒤{" "}
            <Link href="/tools/video-mute" className="font-medium text-brand hover:underline">
              영상 음성 제거
            </Link>
            로 소리를 빼세요. 사이트 서버는 영상 파일을 다루지 않습니다 (서버 비용 0, YouTube 의 서버 차단 회피).
          </p>
          <Notice tone="warning" icon={ShieldCheck} title="저작권 주의">
            내 영상, 사용 허락을 받은 영상, 또는 참고(분석)용으로만 쓰세요. 다른 사람 영상은 소리를 빼고 다시 올려도 YouTube Content ID 가 화면으로
            찾아내 수익 정지·저작권 경고를 받을 수 있습니다.
          </Notice>
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
