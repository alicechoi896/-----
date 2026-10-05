"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { ReferenceVideo } from "@/lib/types";
import { downloadBlob } from "@/lib/photo-process";
import { downloadXhsMuted, type XhsStage } from "@/lib/xhs-download";
import { createZip } from "@/lib/zip";
import { Badge } from "@/components/ui";

/**
 * 샤오홍슈 영상 받기 (영상 URL 가져오기 화면과 제품 상세 화면이 함께 쓴다).
 * 워터마크 없는 원본을 받아 소리만 뺀다.
 * 파일은 브라우저가 직접 받아 처리한다 (서버는 영상 주소만 찾는다).
 */

/** 행마다 진행 상태 */
export type XhsJob = { stage: XhsStage | "error"; progress?: number; error?: string; note?: string };

const STAGE_LABEL: Record<XhsStage, string> = {
  resolve: "영상 찾는 중",
  download: "받는 중",
  mute: "소리 빼는 중",
  done: "저장 완료",
};

export function useXhsDownloads() {
  const [jobs, setJobs] = useState<Record<string, XhsJob>>({});
  const [bulk, setBulk] = useState<string | null>(null);

  const isRunning = (id: string) => {
    const j = jobs[id];
    return Boolean(j && j.stage !== "done" && j.stage !== "error");
  };
  const busy = Object.values(jobs).some((j) => j.stage !== "done" && j.stage !== "error");

  /** 1개. save=false 면 저장하지 않고 결과만 돌려준다 (ZIP 용) */
  async function run(v: ReferenceVideo, save = true): Promise<{ blob: Blob; name: string } | null> {
    const set = (job: XhsJob) => setJobs((prev) => ({ ...prev, [v.id]: job }));
    try {
      const onStage = (stage: XhsStage, progress?: number) => set({ stage, progress });
      const out = await downloadXhsMuted(v.url, onStage);
      if (save) downloadBlob(out.blob, out.name);
      set({ stage: "done", note: save ? "워터마크 없는 원본을 소리 없이 저장했습니다" : "받았습니다 (ZIP 에 담는 중)" });
      return out;
    } catch (e) {
      set({ stage: "error", error: e instanceof Error ? e.message : "받지 못했습니다." });
      return null;
    }
  }

  /** 1개를 바로 저장 */
  function runOne(v: ReferenceVideo) {
    void run(v, true);
  }

  /** 여러 개: 하나씩 처리해 ZIP 하나로 저장 (1개면 그대로) */
  async function runAll(videos: ReferenceVideo[], zipPrefix = "샤오홍슈") {
    if (!videos.length) return;
    const results: { blob: Blob; name: string }[] = [];
    for (const [i, v] of videos.entries()) {
      setBulk(`샤오홍슈 ${i + 1}/${videos.length} 처리 중…`);
      const out = await run(v, false);
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
      downloadBlob(await createZip(files), `${zipPrefix}_음성없음_${files.length}개.zip`);
    }
  }

  return { jobs, bulk, busy, isRunning, runOne, runAll };
}

/** 행 아래 진행 상태 (단계 · 진행률 · 결과) */
export function XhsJobStatus({ job }: { job?: XhsJob }) {
  if (!job) return null;
  if (job.stage === "error") return <p className="mt-0.5 text-xs text-danger">{job.error}</p>;
  if (job.stage === "done")
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
        <CircleCheck className="size-3.5" />
        {job.note ?? "저장했습니다"}
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
