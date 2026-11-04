"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EDIT_MAX_ZOOMS, cleanEdit, frameAt, previewStyle, type Frame, type SourceEdit, type ZoomSeg } from "@/lib/video-production/source-edit";

export type { Frame, SourceEdit };

/** 9:16 결과 미리보기에 확대·위치를 그대로 보여 주는 CSS — 렌더와 같은 계산(outputWindow) */
export function frameStyle(f: Frame): React.CSSProperties {
  return previewStyle(f) ?? {};
}

/**
 * v0.9.165 영상 편집기 (라이브러리·영상 제작 공용): 구간(시작~끝) · 기본 화면(확대·위치) · 시간별 확대(몇 초~몇 초, 배율·위치).
 * 미리보기는 재생 위치의 화면을 렌더와 같은 계산으로 보여 준다 → 결과 영상과 같다. 시간은 원본 초.
 */
export function SourceEditEditor({ url, durationHint, value, onChange }: { url: string | null | undefined; durationHint?: number; value: SourceEdit; onChange: (v: SourceEdit) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [sec, setSec] = useState(value.range?.from ?? 0);
  const [dur, setDur] = useState(durationHint ?? 0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; f: Frame; target: "base" | number } | null>(null);
  const full = dur || durationHint || 0;
  const zooms = value.zooms ?? [];
  const activeIdx = (() => {
    for (let i = zooms.length - 1; i >= 0; i--) if (sec >= zooms[i].from && sec < zooms[i].to) return i;
    return null;
  })();
  const shown = frameAt(value, sec);
  const seek = (t: number) => {
    const v = Math.max(0, Math.min(full || t, t));
    setSec(v);
    if (ref.current) ref.current.currentTime = v;
  };
  const setZoom = (i: number, patch: Partial<ZoomSeg>) => onChange({ ...value, zooms: zooms.map((z, j) => (j === i ? { ...z, ...patch } : z)) });
  const base: Frame = value.frame ?? { zoom: 1, x: 0.5, y: 0.5 };
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]" data-source-editor>
      <div className="space-y-2">
        <div
          className="relative mx-auto aspect-[9/16] max-h-[52vh] w-full cursor-grab overflow-hidden rounded bg-black active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const target = activeIdx ?? "base";
            drag.current = { x: e.clientX, y: e.clientY, f: target === "base" ? base : zooms[target], target };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const box = e.currentTarget.getBoundingClientRect();
            const x = Number(Math.min(1, Math.max(0, d.f.x - (e.clientX - d.x) / box.width / d.f.zoom)).toFixed(3));
            const y = Number(Math.min(1, Math.max(0, d.f.y - (e.clientY - d.y) / box.height / d.f.zoom)).toFixed(3));
            if (d.target === "base") onChange({ ...value, frame: { ...base, x, y } });
            else setZoom(d.target, { x, y });
          }}
          onPointerUp={() => (drag.current = null)}
          data-edit-preview
        >
          {url ? (
            <video
              ref={ref}
              src={url}
              muted
              playsInline
              className="pointer-events-none size-full object-cover"
              style={previewStyle(shown)}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration || durationHint || 0;
                setDur(d);
                e.currentTarget.currentTime = sec;
                // 목록의 길이와 실제 길이가 다르면 구간·확대 끝을 실제 길이에 맞춘다
                if (d && (value.range && value.range.to > d + 0.05 || zooms.some((z) => z.to > d + 0.05)))
                  onChange({ ...value, range: value.range ? { from: Math.min(value.range.from, Math.max(0, d - 0.5)), to: Number(d.toFixed(2)) } : value.range, zooms: zooms.map((z) => ({ ...z, to: Math.min(z.to, Number(d.toFixed(2))) })) });
              }}
              onTimeUpdate={(e) => setSec(Number(e.currentTarget.currentTime.toFixed(2)))}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          ) : (
            <div className="flex size-full items-center justify-center p-4 text-center text-[12px] text-fg-subtle">{url === undefined ? "불러오는 중…" : "원본을 보관하지 않아 미리 볼 수 없습니다 (숫자로는 정할 수 있어요). 제품 상세 › 연결된 영상의 [다운로드]로 보관하면 보입니다."}</div>
          )}
          <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">
            {activeIdx !== null ? `확대 구간 ${activeIdx + 1} · ${zooms[activeIdx].zoom.toFixed(1)}배` : `기본 화면 · ${base.zoom.toFixed(1)}배`} · 끌어서 위치
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())} className="rounded border border-line px-2 py-0.5 text-[12px]" disabled={!url} aria-label={playing ? "멈춤" : "재생"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="tabular text-[12px] text-fg-muted">
            {sec.toFixed(2)} / {full.toFixed(1)}초
          </span>
        </div>
      </div>
      <div className="space-y-3 text-[12.5px]">
        {/* 시간 막대: 회색 = 전체, 파랑 = 쓸 구간, 주황 = 확대 구간, 선 = 지금 */}
        <div className="space-y-1">
          <div
            className="relative h-5 cursor-pointer rounded bg-muted"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * full);
            }}
            data-edit-bar
          >
            {value.range && full > 0 && <div className="absolute inset-y-0 rounded bg-brand/45" style={{ left: `${(Math.min(value.range.from, full) / full) * 100}%`, width: `${((Math.min(value.range.to, full) - Math.min(value.range.from, full)) / full) * 100}%` }} />}
            {full > 0 &&
              zooms.map((z, i) => <div key={i} className={cn("absolute inset-y-1 rounded bg-warning/80", sel === i && "ring-2 ring-warning")} style={{ left: `${(Math.min(z.from, full) / full) * 100}%`, width: `${Math.max(0.5, ((Math.min(z.to, full) - Math.min(z.from, full)) / full) * 100)}%` }} />)}
            {full > 0 && <div className="absolute inset-y-[-3px] w-0.5 bg-fg" style={{ left: `${(Math.min(sec, full) / full) * 100}%` }} />}
          </div>
          <input type="range" min={0} max={Math.max(0.1, full)} step={0.05} value={Math.min(sec, full || sec)} onChange={(e) => seek(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" aria-label="재생 위치" />
        </div>

        <section className="space-y-1.5 rounded-control border border-line p-2">
          <p className="font-semibold">① 쓸 구간 <span className="font-normal text-fg-subtle">— 이 영상을 쓰는 컷은 시작부터 차례로 잘립니다</span></p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => onChange({ ...value, range: { from: Number(sec.toFixed(2)), to: Math.max(Number(sec.toFixed(2)) + 0.5, value.range?.to ?? full) } })} data-edit-from>
              여기서 시작
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onChange({ ...value, range: { from: Math.min(value.range?.from ?? 0, Number(sec.toFixed(2)) - 0.5), to: Number(sec.toFixed(2)) } })} data-edit-to>
              여기서 끝
            </Button>
            <Input type="number" step="0.1" min={0} value={value.range?.from ?? ""} onChange={(e) => onChange({ ...value, range: { from: Number(e.target.value), to: value.range?.to ?? full } })} className="h-8 w-20" aria-label="시작 초" />
            ~
            <Input type="number" step="0.1" min={0} value={value.range?.to ?? ""} onChange={(e) => onChange({ ...value, range: { from: value.range?.from ?? 0, to: Number(e.target.value) } })} className="h-8 w-20" aria-label="끝 초" />초
            <button type="button" className="text-fg-subtle hover:text-fg" onClick={() => onChange({ ...value, range: null })}>
              구간 없음(자동)
            </button>
          </div>
        </section>

        <section className="space-y-1.5 rounded-control border border-line p-2">
          <p className="font-semibold">② 기본 화면 <span className="font-normal text-fg-subtle">— 확대 구간 밖에서 쓰는 화면 (로고·글자 피하기)</span></p>
          <label className="flex items-center gap-2">
            확대
            <input type="range" min={1} max={2.4} step={0.05} value={base.zoom} onChange={(e) => onChange({ ...value, frame: { ...base, zoom: Number(e.target.value) } })} className="min-w-0 flex-1 accent-[var(--color-brand)]" aria-label="기본 확대" data-edit-base-zoom />
            <span className="tabular w-12 text-right">{Math.round(base.zoom * 100)}%</span>
            <button type="button" className="text-fg-subtle hover:text-fg" onClick={() => onChange({ ...value, frame: null })}>
              처음대로
            </button>
          </label>
        </section>

        <section className="space-y-1.5 rounded-control border border-line p-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold">③ 시간별 확대 <span className="font-normal text-fg-subtle">— 그 시간 동안만 그 배율·위치 (원본 초)</span></p>
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              disabled={zooms.length >= EDIT_MAX_ZOOMS}
              onClick={() => {
                const from = Number(sec.toFixed(2));
                onChange({ ...value, zooms: [...zooms, { from, to: Number(Math.min(full || from + 2, from + 2).toFixed(2)), zoom: 1.5, x: base.x, y: base.y }] });
                setSel(zooms.length);
              }}
              data-edit-add-zoom
            >
              지금 위치에 확대 구간
            </Button>
          </div>
          {zooms.length === 0 && <p className="text-fg-subtle">없음 — 예: 6.0~8.5초 동안 150% 확대</p>}
          {zooms.map((z, i) => (
            <div key={i} className={cn("flex flex-wrap items-center gap-1.5 rounded px-1 py-1", sel === i && "bg-warning/10")} onClick={() => setSel(i)} data-edit-zoom>
              <span className="w-4 text-center font-semibold text-fg-subtle">{i + 1}</span>
              <Input type="number" step="0.1" min={0} value={z.from} onChange={(e) => setZoom(i, { from: Number(e.target.value) })} className="h-7 w-16" aria-label={`${i + 1} 시작`} />
              ~
              <Input type="number" step="0.1" min={0} value={z.to} onChange={(e) => setZoom(i, { to: Number(e.target.value) })} className="h-7 w-16" aria-label={`${i + 1} 끝`} />초
              <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => setZoom(i, { from: Number(sec.toFixed(2)) })}>
                지금=시작
              </button>
              <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => setZoom(i, { to: Number(sec.toFixed(2)) })}>
                지금=끝
              </button>
              <input type="range" min={1} max={2.4} step={0.05} value={z.zoom} onChange={(e) => setZoom(i, { zoom: Number(e.target.value) })} className="w-24 accent-[var(--color-warning)]" aria-label={`${i + 1} 배율`} />
              <span className="tabular w-11 text-right">{Math.round(z.zoom * 100)}%</span>
              <button type="button" className="text-[11px] text-fg-muted hover:text-fg" onClick={() => seek(z.from)}>
                보기
              </button>
              <button type="button" className="text-fg-subtle hover:text-danger" onClick={() => onChange({ ...value, zooms: zooms.filter((_, j) => j !== i) })} aria-label={`${i + 1} 지우기`}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <p className="text-[11px] text-fg-subtle">확대 구간을 재생하는 동안 미리보기를 끌면 그 구간의 위치가 바뀝니다. 겹치면 아래 구간이 우선합니다.</p>
        </section>
      </div>
    </div>
  );
}

/** 라이브러리(영상 URL 가져오기·제품 상세 연결된 영상)의 영상 편집 설정 창 */
export function EditDialog({ videoId, title, durationSec, initial, onClose, onSaved }: { videoId: string; title: string; durationSec?: number; initial: SourceEdit | null; onClose: () => void; onSaved: (e: SourceEdit | null) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [edit, setEdit] = useState<SourceEdit>(initial ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api.videoProduction
      .sourceUrl(videoId)
      .then((r) => alive && setUrl(r.url))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [videoId]);
  async function save(next: SourceEdit | null) {
    setBusy(true);
    setErr(null);
    try {
      const clean = next ? cleanEdit(next) : null;
      await api.videoProduction.setEdit(videoId, clean);
      onSaved(clean);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" role="dialog" aria-label="영상 편집 설정" data-frame-dialog onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-card bg-canvas p-4 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-[14px] font-semibold">영상 편집 설정 · {title}</p>
          <p className="text-[12px] text-fg-muted">여기서 정한 구간·확대는 이 영상으로 컷 계획을 만들 때 그대로 들어가고, 영상 제작 화면에서 더 고칠 수 있습니다. 영상 파일은 그대로라 화질 손해가 없습니다.</p>
        </div>
        <SourceEditEditor url={url} durationHint={durationSec} value={edit} onChange={setEdit} />
        {err && <p className="text-[12px] text-danger">{err}</p>}
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            모두 지우기 (자동으로)
          </Button>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" variant="primary" loading={busy} onClick={() => void save(edit)} data-frame-save>
              저장
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** 목록에 보일 짧은 요약 (예: '5~12초 · 130% · 확대 2') */
export function editSummary(e: SourceEdit | null | undefined): string | null {
  if (!e) return null;
  const parts = [e.range ? `${e.range.from}~${e.range.to}초` : "", e.frame ? `${Math.round(e.frame.zoom * 100)}%` : "", e.zooms?.length ? `확대 ${e.zooms.length}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
