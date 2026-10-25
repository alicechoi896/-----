"use client";

import { useRef, useState } from "react";
import { AudioLines, Download, Film, Loader2, Scissors, Upload } from "lucide-react";
import { SILENCE_DEFAULTS, SILENCE_LIMITS, SILENCE_OPTIONS, type SilenceCutResult } from "@/lib/silence-cut";
import { api } from "@/lib/api-client";
import { Button, FormField, Notice, SectionCard, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

const sec = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}분 ${(n % 60).toFixed(1)}초` : `${n.toFixed(1)}초`);

/**
 * 무음 구간 자르기 (v0.9.70). docs/SILENCE_CUT.md
 * 영상 고르기 → [무음 구간 자르기]: 저장소에 직접 올림(진행률) → 서버가 무음을 찾아 모두 잘라 냄 → 미리보기·다운로드.
 * 원본은 서버가 받자마자 지우고, 결과는 1시간 뒤 정리된다.
 */
export function SilenceCutTool() {
  const [file, setFile] = useState<File | null>(null);
  const [minSilence, setMinSilence] = useState<number>(SILENCE_DEFAULTS.minSilence);
  const [noiseDb, setNoiseDb] = useState<number>(SILENCE_DEFAULTS.noiseDb);
  const [pad, setPad] = useState<number>(SILENCE_DEFAULTS.pad);
  const [stage, setStage] = useState<"idle" | "upload" | "cut">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SilenceCutResult | null>(null);
  const busy = useRef(false);

  function choose(f: File | undefined) {
    setResult(null);
    setError(null);
    if (!f) return;
    if (f.size > SILENCE_LIMITS.maxBytes) {
      setError(`영상이 너무 큽니다 (최대 ${Math.round(SILENCE_LIMITS.maxBytes / 1024 / 1024)}MB).`);
      return;
    }
    setFile(f);
  }

  async function run() {
    if (!file || busy.current) return;
    busy.current = true;
    setError(null);
    setResult(null);
    try {
      setStage("upload");
      setProgress(0);
      const target = await api.silenceCut.prepare(file.name, file.size);
      await api.silenceCut.upload(target, file, setProgress);
      setStage("cut");
      setResult(await api.silenceCut.cut({ key: target.key, minSilence, noiseDb, pad, fileName: file.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "무음 구간을 자르지 못했습니다.");
    } finally {
      busy.current = false;
      setStage("idle");
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[420px_1fr]" data-silence-cut>
      <SectionCard title="영상 · 설정" icon={AudioLines} description="말이 없는 구간을 모두 잘라 냅니다. 기본은 0.2초 이상 조용하면 무음으로 보고 전부 없앱니다.">
        <div className="space-y-4">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-control border-2 border-dashed px-4 py-8 text-center text-[13px]",
              file ? "border-brand-line bg-brand-soft/30 text-fg" : "border-line text-fg-subtle hover:border-brand hover:text-brand",
            )}
            data-silence-file
          >
            {file ? <Film className="size-6 text-brand" /> : <Upload className="size-6" />}
            <span className="font-medium">{file ? file.name : "영상 파일 고르기 (mp4·mov)"}</span>
            <span className="text-xs text-fg-subtle">{file ? `${(file.size / 1024 / 1024).toFixed(1)}MB` : `최대 ${Math.round(SILENCE_LIMITS.maxBytes / 1024 / 1024)}MB · ${SILENCE_LIMITS.maxDurationSec / 60}분`}</span>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm,.mkv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} aria-label="영상 파일" />
          </label>

          <FormField label="무음으로 볼 길이" hint="이 시간 이상 조용하면 잘라 냅니다. 짧을수록 더 많이 잘립니다 (0.2초 추천).">
            <SegmentedControl size="sm" value={String(minSilence)} onChange={(v) => setMinSilence(Number(v))} options={SILENCE_OPTIONS.minSilence.map((x) => ({ value: String(x), label: `${x}초` }))} />
          </FormField>
          <FormField label="무음 기준 (소리 크기)" hint="배경음악·잡음이 있어 덜 잘리면 '작은 소리도 무음으로', 말끝이 잘리면 '아주 조용할 때만'.">
            <SegmentedControl size="sm" value={String(noiseDb)} onChange={(v) => setNoiseDb(Number(v))} options={SILENCE_OPTIONS.noiseDb.map((x) => ({ value: String(x.value), label: x.label }))} />
          </FormField>
          <FormField label="말 앞뒤 여유" hint="말끝이 뚝 끊기지 않게 남겨 둘 시간입니다. 0초면 최대한 촘촘하게.">
            <SegmentedControl size="sm" value={String(pad)} onChange={(v) => setPad(Number(v))} options={SILENCE_OPTIONS.pad.map((x) => ({ value: String(x), label: x ? `${x}초` : "없음" }))} />
          </FormField>

          {error && <Notice tone="warning">{error}</Notice>}
          <Button variant="primary" icon={Scissors} className="w-full" loading={stage !== "idle"} disabled={!file || stage !== "idle"} onClick={() => void run()} data-silence-run>
            무음 구간 자르기
          </Button>
          <p className="text-[11px] text-fg-subtle">영상은 저장소에 잠시 올렸다가 처리하자마자 지웁니다. 결과 영상은 1시간 뒤 정리됩니다 (그 전에 받아 두세요). 외부 유료 API 를 쓰지 않습니다.</p>
        </div>
      </SectionCard>

      <SectionCard title="결과" icon={Film}>
        {stage !== "idle" ? (
          <div className="py-16 text-center" data-silence-progress>
            <Loader2 className="mx-auto size-6 animate-spin text-brand" />
            <p className="mt-3 text-[14px] font-semibold text-fg">{stage === "upload" ? `영상 올리는 중… ${progress}%` : "무음 구간을 찾아 자르는 중…"}</p>
            {stage === "upload" && (
              <div className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(3, progress)}%` }} />
              </div>
            )}
            <p className="mt-2 text-xs text-fg-subtle">{stage === "cut" ? "영상 길이에 따라 30초~3분쯤 걸립니다. 화면을 닫지 마세요." : "파일이 크면 시간이 걸립니다."}</p>
          </div>
        ) : result ? (
          <div className="grid gap-5 md:grid-cols-[280px_1fr]" data-silence-result>
            <video src={result.url} controls playsInline className="w-full rounded-control bg-black" />
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-2 text-[13px]">
                <Stat label="원래 길이" value={sec(result.beforeSec)} />
                <Stat label="자른 뒤 길이" value={sec(result.afterSec)} strong />
                <Stat label="줄어든 시간" value={`${sec(result.removedSec)} (${Math.round((result.removedSec / Math.max(0.01, result.beforeSec)) * 100)}%)`} />
                <Stat label="잘라 낸 곳" value={`${result.cuts}곳`} />
              </dl>
              <a href={result.downloadUrl} download={result.fileName} className="inline-flex h-10 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-white hover:opacity-90" data-silence-download>
                <Download className="size-4" /> 다운로드
              </a>
              <p className="text-[11.5px] text-fg-subtle">마음에 안 들면 설정을 바꿔 다시 자르세요 (같은 영상을 다시 올립니다).</p>
            </div>
          </div>
        ) : (
          <p className="py-16 text-center text-[13px] text-fg-subtle">영상을 고르고 [무음 구간 자르기]를 누르면 여기에 결과가 나옵니다.</p>
        )}
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-control border border-line px-3 py-2">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className={cn("tabular text-[14px] text-fg", strong && "font-bold text-brand")}>{value}</dd>
    </div>
  );
}
