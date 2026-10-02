"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, Download, Film, ListPlus, ShieldCheck, Terminal, Trash2 } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { COOKIE_OPTIONS, DOWNLOAD_DIR, INSTALL_COMMANDS, downloadCommand, type CookieSource } from "@/lib/video-download";
import { PLATFORM_LABEL, parseVideoLinks } from "@/lib/video-links";
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
  Select,
  Textarea,
  type Column,
} from "@/components/ui";
import { VideoThumb } from "@/components/shared/VideoThumb";
import { cn, formatRelative } from "@/lib/utils";

const MAX_BATCH = 20;
/** 로그인 정보 선택은 이 브라우저에만 기억한다 (화면 편의) */
const COOKIE_KEY = "work_auto.download-cookies";

function readCookieChoice(): CookieSource {
  try {
    const v = window.localStorage.getItem(COOKIE_KEY) as CookieSource | null;
    return v && COOKIE_OPTIONS.some((o) => o.value === v) ? v : "none";
  } catch {
    return "none";
  }
}

type ImportResult = { url: string; ok: boolean; error?: string };


/**
 * 영상 URL 가져오기.
 * - URL 여러 개를 줄바꿈으로 넣으면 한 번에 목록이 생긴다. 샤오홍슈 앱의 공유 문구를 그대로 붙여넣어도 링크·제목을 뽑는다
 * - 다운로드: 내 PC 에서 실행할 yt-dlp 명령을 복사한다 (받은 뒤 소리 트랙 제거 → 소리 없는 파일). 사이트 서버는 영상 파일을 다루지 않는다.
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
  const [cookies, setCookies] = useState<CookieSource>(() => (typeof window === "undefined" ? "none" : readCookieChoice()));

  const links = parseVideoLinks(text);
  const urls = links.map((l) => l.url);

  function chooseCookies(v: CookieSource) {
    setCookies(v);
    try {
      window.localStorage.setItem(COOKIE_KEY, v);
    } catch {
      // 기억하지 못해도 이번 화면에서는 쓴다
    }
  }

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

  async function copyDownload(v: ReferenceVideo) {
    try {
      await navigator.clipboard.writeText(downloadCommand([v.url], cookies));
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
              {PLATFORM_LABEL[v.platform] ?? "기타"} · {v.channelName}
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
      <SectionCard title="영상 가져오기" icon={ListPlus} description="샤오홍슈·YouTube 등 영상 링크를 한 줄에 하나씩 넣으세요. 샤오홍슈 앱의 공유 문구를 그대로 붙여넣어도 됩니다. 한 번에 20개까지.">
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
              placeholder={"http://xhslink.com/a/… (샤오홍슈 공유 문구 그대로 OK)\nhttps://www.xiaohongshu.com/explore/…\nhttps://www.youtube.com/shorts/…"}
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
                value={downloadCommand(videos.map((v) => v.url), cookies)}
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

      <DownloadGuide open={guideOpen} onToggle={() => setGuideOpen((v) => !v)} cookies={cookies} onCookies={chooseCookies} />
    </div>
  );
}

/** 다운로드 방법 (처음 한 번 설치 → 명령 붙여넣기) */
function DownloadGuide({
  open,
  onToggle,
  cookies,
  onCookies,
}: {
  open: boolean;
  onToggle: () => void;
  cookies: CookieSource;
  onCookies: (v: CookieSource) => void;
}) {
  const cookieHint = COOKIE_OPTIONS.find((o) => o.value === cookies)?.hint;
  return (
    <section className="rounded-card border border-line bg-subtle/60">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <Terminal className="size-4 text-fg-subtle" />
          다운로드 방법 (샤오홍슈·YouTube → 소리 없는 영상으로 저장)
        </span>
        <span className="text-xs text-fg-subtle">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
          <ol className="space-y-3">
            <Step n={1} title="처음 한 번만: 다운로드 도구(yt-dlp)와 ffmpeg 설치">
              시작 메뉴에서 <b>PowerShell</b> 을 열고 아래 두 줄을 하나씩 붙여넣고 Enter. 설치가 끝나면 PowerShell 을 닫았다가 다시 엽니다.
              {INSTALL_COMMANDS.map((c) => (
                <Code key={c} text={c} />
              ))}
            </Step>
            <Step n={2} title="샤오홍슈 로그인 정보 (샤오홍슈는 보통 필요)">
              <span>샤오홍슈는 로그인하지 않으면 영상을 보여주지 않는 경우가 많습니다. 브라우저에 로그인해 둔 정보를 다운로드 도구가 읽게 합니다.</span>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Select
                  className="w-48"
                  value={cookies}
                  options={COOKIE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(e) => onCookies(e.target.value as CookieSource)}
                />
                <span className="text-xs text-fg-subtle">{cookieHint}</span>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">로그인 정보는 내 PC 안에서만 쓰이고 이 사이트로 전송되지 않습니다.</p>
            </Step>
            <Step n={3} title="영상 옆 [다운로드] 또는 [전체 다운로드 명령 복사]">
              받은 뒤 소리 트랙을 빼는 명령이 복사됩니다 (다시 인코딩하지 않아 화질 그대로).
            </Step>
            <Step n={4} title="PowerShell 에 붙여넣고 Enter">
              <span>
                <code className="rounded bg-canvas px-1 ring-1 ring-line">{DOWNLOAD_DIR.replace("~", "내 폴더")}</code> 에 <b>소리 없는 영상</b>이 저장됩니다.
                파일 이름 끝에 <code className="rounded bg-canvas px-1 ring-1 ring-line">_음성없음</code> 이 붙습니다.
              </span>
            </Step>
          </ol>
          <p className="text-xs text-fg-subtle">
            &ldquo;No video formats found&rdquo; 또는 &ldquo;笔记暂时无法浏览&rdquo; 가 나오면 2번의 로그인 정보를 선택하고 다시 복사하세요. 링크가 오래되면(xsec_token 만료) 앱에서 공유 링크를 새로 복사하세요.
            이미 소리 있는 파일을 갖고 있다면{" "}
            <Link href="/tools/video-mute" className="font-medium text-brand hover:underline">
              영상 음성 제거
            </Link>
            에 넣어도 됩니다. 사이트 서버는 영상 파일을 다루지 않습니다 (서버 비용 0, 서버 차단 회피).
          </p>
          <Notice tone="warning" icon={ShieldCheck} title="저작권 주의">
            내 영상, 사용 허락을 받은 영상(제조사·판매자 제공 소스 등), 또는 참고(분석)용으로만 쓰세요. 다른 사람 영상은 소리를 빼고 다시 올려도
            플랫폼이 화면으로 찾아내 수익 정지·저작권 경고를 받을 수 있습니다.
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
