"use client";

import { useRef, useState } from "react";
import { CircleCheck, Download, FileVideo, FolderDown, LoaderCircle, ShieldCheck, Trash2, VolumeX } from "lucide-react";
import { MAX_VIDEO_BYTES, VIDEO_ACCEPT, loadEngine, mutedFileName, removeAudio } from "@/lib/video-mute";
import { downloadBlob } from "@/lib/photo-process";
import { createZip } from "@/lib/zip";
import { Badge, Button, IconButton, Notice, SectionCard } from "@/components/ui";
import { cn } from "@/lib/utils";

type Status = "waiting" | "working" | "done" | "error";

interface Job {
  id: string;
  file: File;
  status: Status;
  progress: number;
  result?: Blob;
  resultUrl?: string;
  error?: string;
}

const mb = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)}MB`;

/**
 * 영상 음성 제거 — 내 영상 파일에서 소리만 빼고 원본 화질 그대로 내려받는다.
 * 브라우저 안에서만 처리하고 서버에 올리거나 저장하지 않는다.
 */
export function VideoMuteTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [engine, setEngine] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [engineError, setEngineError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [zipping, setZipping] = useState(false);

  const update = (id: string, patch: Partial<Job>) => setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const added: Job[] = Array.from(files)
      .filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name))
      .map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        status: file.size > MAX_VIDEO_BYTES ? ("error" as const) : ("waiting" as const),
        progress: 0,
        error: file.size > MAX_VIDEO_BYTES ? "1GB 이하 영상만 처리할 수 있습니다." : undefined,
      }));
    setJobs((prev) => [...prev, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function runAll() {
    setRunning(true);
    try {
      if (engine !== "ready") {
        setEngine("loading");
        setEngineError(null);
        try {
          await loadEngine();
          setEngine("ready");
        } catch {
          setEngine("error");
          setEngineError("처리 엔진을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. (회사 네트워크에서 unpkg.com 이 막혀 있을 수 있습니다)");
          return;
        }
      }
      // 하나씩 차례로 처리한다 (메모리 사용을 줄이기 위해)
      for (const job of jobs.filter((j) => j.status === "waiting")) {
        update(job.id, { status: "working", progress: 0 });
        try {
          const blob = await removeAudio(job.file, (p) => update(job.id, { progress: p }));
          update(job.id, { status: "done", progress: 1, result: blob, resultUrl: URL.createObjectURL(blob) });
        } catch (e) {
          update(job.id, { status: "error", error: e instanceof Error ? e.message : "처리하지 못했습니다." });
        }
      }
    } finally {
      setRunning(false);
    }
  }

  function remove(job: Job) {
    if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
  }

  async function downloadAll() {
    const done = jobs.filter((j) => j.result);
    if (done.length === 1) return downloadBlob(done[0].result!, mutedFileName(done[0].file.name));
    setZipping(true);
    try {
      const zip = await createZip(done.map((j) => ({ name: mutedFileName(j.file.name), blob: j.result! })));
      downloadBlob(zip, `음성제거_영상${done.length}개.zip`);
    } finally {
      setZipping(false);
    }
  }

  const waiting = jobs.filter((j) => j.status === "waiting").length;
  const doneCount = jobs.filter((j) => j.status === "done").length;

  return (
    <div className="space-y-5">
      <Notice tone="neutral" icon={ShieldCheck} title="직접 촬영했거나 사용 허락을 받은 영상만 처리하세요">
        영상 파일은 이 브라우저 안에서만 처리되고 서버로 올라가지 않습니다. 영상은 다시 인코딩하지 않고 소리만 빼므로 화질이 그대로이고 빠릅니다.
        다른 사람의 YouTube·NAVER 영상을 내려받는 기능은 각 플랫폼 이용약관과 저작권 때문에 제공하지 않습니다.
      </Notice>

      <SectionCard
        title="영상 파일"
        icon={FileVideo}
        description="MP4, MOV, WEBM, MKV · 파일당 1GB 이하 · 여러 개를 한 번에 넣을 수 있습니다."
        actions={
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <Button size="sm" icon={FolderDown} loading={zipping} onClick={() => void downloadAll()}>
                {doneCount > 1 ? `완료 ${doneCount}개 ZIP 다운로드` : "다운로드"}
              </Button>
            )}
            <Button size="sm" variant="primary" icon={VolumeX} loading={running} disabled={!waiting} onClick={() => void runAll()}>
              음성 제거 {waiting ? `(${waiting}개)` : ""}
            </Button>
          </div>
        }
      >
        <input ref={inputRef} type="file" accept={VIDEO_ACCEPT} multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong bg-subtle/50 px-4 py-8 text-[13px] text-fg-subtle hover:border-brand-line hover:text-brand"
        >
          <FileVideo className="size-6" />
          영상을 끌어다 놓거나 눌러서 고르세요
        </button>

        {engine === "loading" && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
            <LoaderCircle className="size-3.5 animate-spin" />
            처리 엔진을 불러오는 중입니다 (처음 한 번 약 30MB, 이후에는 브라우저에 저장된 것을 씁니다)…
          </p>
        )}
        {engineError && <p className="mt-3 text-xs text-danger">{engineError}</p>}

        {jobs.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-control border border-line">
            {jobs.map((job) => (
              <li key={job.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{job.file.name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {mb(job.file.size)}
                    {job.result && ` → ${mb(job.result.size)} · ${mutedFileName(job.file.name)}`}
                    {job.error && <span className="text-danger"> · {job.error}</span>}
                  </p>
                  {job.status === "working" && (
                    <div className="mt-1.5 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
                    </div>
                  )}
                </div>
                <StatusBadge status={job.status} progress={job.progress} />
                {job.resultUrl && (
                  <>
                    {/* 결과 확인용 미리보기 (소리 없음) */}
                    <video src={job.resultUrl} controls muted className="h-16 rounded-md bg-fg/90" />
                    <Button size="sm" icon={Download} onClick={() => downloadBlob(job.result!, mutedFileName(job.file.name))}>
                      다운로드
                    </Button>
                  </>
                )}
                <IconButton icon={Trash2} label="목록에서 빼기" size="sm" disabled={job.status === "working"} onClick={() => remove(job)} className="hover:text-danger" />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: Status; progress: number }) {
  if (status === "done")
    return (
      <Badge tone="success">
        <CircleCheck className="size-3" />
        완료
      </Badge>
    );
  if (status === "working") return <Badge tone="brand">{Math.round(progress * 100)}%</Badge>;
  if (status === "error") return <Badge tone="danger">실패</Badge>;
  return <Badge tone="neutral" className={cn("text-fg-subtle")}>대기</Badge>;
}
