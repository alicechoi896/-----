"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, LoaderCircle, ShieldCheck, Square, Trash2, X } from "lucide-react";
import { MODE_LABEL, openEditSession, type EditBox, type EditMode, type EditSession } from "@/lib/video-edit";
import { downloadBlob } from "@/lib/photo-process";
import { fetchXhsSource, mutedName, type XhsStage } from "@/lib/xhs-download";
import { Badge, Button, Checkbox, Notice, SegmentedControl } from "@/components/ui";
import { cn } from "@/lib/utils";

export type EditorSource = { kind: "xhs"; url: string; title: string } | { kind: "file"; file: File };

const MODES: { value: EditMode; label: string }[] = [
  { value: "erase", label: "지우기" },
  { value: "blur", label: "흐리게" },
  { value: "cover", label: "가리기" },
];
const MODE_HINT: Record<EditMode, string> = {
  erase: "주변 색으로 메웁니다. 작은 로고·워터마크에 알맞습니다.",
  blur: "흐리게 만듭니다. 넓은 자막 줄에 알맞습니다.",
  cover: "색으로 덮습니다. 그 위에 내 자막을 넣을 때 알맞습니다.",
};
const MODE_COLOR: Record<EditMode, string> = { erase: "border-brand bg-brand/15", blur: "border-warning bg-warning/15", cover: "border-fg bg-fg/25" };

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}.${Math.floor((t % 1) * 10)}`;
const MAX_W = 420;

type Phase = { kind: "loading"; label: string; progress?: number } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * 영상 편집기: 화면 위에 상자를 그려 로고·자막을 지우기/흐리게/가리기 + 소리 제거 → H.264 mp4 저장.
 * 원작자에게 로고·자막 제거 허락을 받은 영상만 처리한다 (체크해야 내보내기가 열린다).
 */
export function VideoEditor({ source, onClose }: { source: EditorSource; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", label: "준비 중…" });
  const [session, setSession] = useState<EditSession | null>(null);
  const [title, setTitle] = useState(source.kind === "xhs" ? source.title : source.file.name.replace(/\.[^.]+$/, ""));
  const [clean, setClean] = useState<boolean | null>(null);
  const [t, setT] = useState(0);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameBusy, setFrameBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [boxes, setBoxes] = useState<EditBox[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newMode, setNewMode] = useState<EditMode>("erase");
  const [allowed, setAllowed] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const sessionRef = useRef<EditSession | null>(null);

  // 1) 영상 준비: 샤오홍슈면 받아 오고(워터마크 없는 H.265 우선), 편집 세션을 연다
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let blob: Blob;
        if (source.kind === "xhs") {
          const labels: Record<XhsStage, string> = { resolve: "영상 찾는 중…", download: "영상 받는 중…", mute: "", done: "" };
          const src = await fetchXhsSource(source.url, (stage, progress) => active && setPhase({ kind: "loading", label: labels[stage], progress }));
          blob = src.blob;
          if (active) {
            setTitle(src.title);
            setClean(src.clean);
          }
        } else {
          blob = source.file;
        }
        if (!active) return;
        setPhase({ kind: "loading", label: "편집 엔진 준비 중… (처음 한 번 약 30MB)" });
        const s = await openEditSession(blob);
        if (!active) return void s.close();
        sessionRef.current = s;
        setSession(s);
        setFrame(await s.frameAt(0));
        setPhase({ kind: "ready" });
      } catch (e) {
        if (active) setPhase({ kind: "error", message: e instanceof Error ? e.message : `영상을 열지 못했습니다. (${String((e as { message?: string })?.message ?? e)})` });
      }
    })();
    return () => {
      active = false;
      void sessionRef.current?.close();
    };
  }, [source]);

  // Esc 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exporting == null && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, exporting]);

  // 2) 시간 이동 → 그 화면 (잠깐 멈춘 뒤 한 번만)
  const frameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seek = useCallback(
    (next: number) => {
      if (!session) return;
      const clamped = Math.max(0, Math.min(next, session.duration));
      setT(clamped);
      if (frameTimer.current) clearTimeout(frameTimer.current);
      frameTimer.current = setTimeout(async () => {
        setFrameBusy(true);
        try {
          setFrame(await session.frameAt(clamped));
        } finally {
          setFrameBusy(false);
        }
      }, 250);
    },
    [session],
  );

  async function preview() {
    if (!session) return;
    setPreviewing(true);
    try {
      setFrame(await session.previewAt(t, boxes));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "미리보기를 만들지 못했습니다.");
    } finally {
      setPreviewing(false);
    }
  }

  async function exportVideo() {
    if (!session) return;
    setExportError(null);
    setDone(null);
    setExporting(0);
    try {
      const blob = await session.exportVideo(boxes, (p) => setExporting(p));
      const name = mutedName(title, boxes.length ? "편집" : "음성없음");
      downloadBlob(blob, name);
      setDone(`${name} 저장 (${(blob.size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "내보내지 못했습니다.");
    } finally {
      setExporting(null);
    }
  }

  const update = (id: string, patch: Partial<EditBox>) => setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const scale = session ? Math.min(MAX_W / session.width, (typeof window === "undefined" ? 700 : window.innerHeight * 0.68) / session.height) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4">
      <div role="dialog" aria-modal="true" className="flex max-h-[96vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-card bg-canvas shadow-[0_20px_60px_rgba(15,23,42,0.25)]">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-fg">영상 편집 · 로고·자막 지우기</p>
            <p className="mt-0.5 truncate text-xs text-fg-subtle">
              {title}
              {clean === true && " · 샤오홍슈 워터마크 없는 원본(H.265)에서 시작"}
              {clean === false && " · 이 영상은 워터마크 없는 원본이 없어 H.264(워터마크 포함)에서 시작"}
            </p>
          </div>
          <button type="button" aria-label="닫기" disabled={exporting != null} onClick={onClose} className="rounded-control p-1.5 text-fg-subtle hover:bg-muted hover:text-fg disabled:opacity-40">
            <X className="size-4" />
          </button>
        </header>

        {phase.kind !== "ready" || !session ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-20 text-[13px] text-fg-muted">
            {phase.kind === "error" ? (
              <Notice tone="warning">{phase.message}</Notice>
            ) : (
              <>
                <LoaderCircle className="size-6 animate-spin text-brand" />
                <span>
                  {phase.kind === "loading" ? phase.label : ""}
                  {phase.kind === "loading" && phase.progress != null ? ` ${Math.round(phase.progress * 100)}%` : ""}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
            {/* 화면 + 상자 그리기 */}
            <div className="space-y-3">
              <BoxCanvas
                frame={frame}
                width={session.width}
                height={session.height}
                scale={scale}
                boxes={boxes}
                selected={selected}
                newMode={newMode}
                t={t}
                onAdd={(b) => {
                  setBoxes((prev) => [...prev, b]);
                  setSelected(b.id);
                }}
                onMove={(id, x, y) => update(id, { x, y })}
                onSelect={setSelected}
                busy={frameBusy || previewing}
              />
              <div className="flex items-center gap-2">
                <button type="button" aria-label="1초 뒤로" onClick={() => seek(t - 1)} className="rounded-control p-1 hover:bg-muted">
                  <ChevronLeft className="size-4" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={session.duration || 0}
                  step={0.1}
                  value={t}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="flex-1 accent-[var(--color-brand)]"
                  aria-label="재생 위치"
                />
                <button type="button" aria-label="1초 앞으로" onClick={() => seek(t + 1)} className="rounded-control p-1 hover:bg-muted">
                  <ChevronRight className="size-4" />
                </button>
                <span className="tabular w-24 text-right text-xs text-fg-subtle">
                  {fmt(t)} / {fmt(session.duration)}
                </span>
              </div>
              <Button size="sm" icon={Eye} loading={previewing} disabled={!boxes.length} onClick={() => void preview()}>
                이 화면 미리보기 (처리 결과)
              </Button>
            </div>

            {/* 상자 목록 · 내보내기 */}
            <div className="min-w-0 space-y-4">
              <div className="rounded-control border border-line bg-subtle/60 px-3.5 py-3 text-[13px] text-fg-muted">
                <p className="font-medium text-fg">화면에서 마우스로 끌어 로고·자막 위치에 상자를 그리세요.</p>
                <p className="mt-0.5 text-xs">
                  상자를 끌면 옮겨집니다. 자막처럼 잠깐 나오는 글자는 구간을 정하세요. 새 상자 방식:
                </p>
                <SegmentedControl className="mt-2" size="sm" options={MODES} value={newMode} onChange={setNewMode} />
                <p className="mt-1 text-xs text-fg-subtle">{MODE_HINT[newMode]}</p>
              </div>

              {boxes.length === 0 ? (
                <p className="text-[13px] text-fg-subtle">아직 상자가 없습니다. 상자 없이 내보내면 소리만 뺀 H.264 영상이 저장됩니다.</p>
              ) : (
                <ul className="space-y-2">
                  {boxes.map((b, i) => (
                    <li
                      key={b.id}
                      onClick={() => setSelected(b.id)}
                      className={cn("space-y-2 rounded-control border p-3", selected === b.id ? "border-brand bg-brand-soft/30" : "border-line")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">
                          <Square className="size-3" />
                          상자 {i + 1}
                        </Badge>
                        <SegmentedControl size="sm" options={MODES} value={b.mode} onChange={(m) => update(b.id, { mode: m })} />
                        {b.mode === "cover" && (
                          <input
                            type="color"
                            aria-label="덮을 색"
                            value={b.color ?? "#000000"}
                            onChange={(e) => update(b.id, { color: e.target.value })}
                            className="h-7 w-9 cursor-pointer rounded border border-line"
                          />
                        )}
                        <button
                          type="button"
                          aria-label="상자 삭제"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBoxes((prev) => prev.filter((x) => x.id !== b.id));
                          }}
                          className="ml-auto rounded p-1 text-fg-subtle hover:bg-muted hover:text-danger"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                        <span className="text-fg-subtle">적용 구간</span>
                        <span className="tabular font-medium text-fg">
                          {b.start == null && b.end == null ? "영상 전체" : `${fmt(b.start ?? 0)} ~ ${b.end == null ? "끝" : fmt(b.end)}`}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => update(b.id, { start: t, end: b.end != null && b.end < t ? null : b.end })}>
                          여기부터
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => update(b.id, { end: t, start: b.start != null && b.start > t ? null : (b.start ?? 0) })}>
                          여기까지
                        </Button>
                        {(b.start != null || b.end != null) && (
                          <Button size="sm" variant="ghost" onClick={() => update(b.id, { start: null, end: null })}>
                            전체로
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-3 border-t border-line pt-4">
                <label className="flex items-start gap-2 text-[13px] text-fg-muted">
                  <Checkbox checked={allowed} onChange={setAllowed} label="허락 확인" className="mt-0.5" />
                  <span>
                    <ShieldCheck className="mr-1 inline size-3.5 text-success" />
                    원작자에게 이 영상의 사용과 <b className="text-fg">로고·자막 제거</b> 허락을 받았습니다.
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" icon={Download} disabled={!allowed || exporting != null} loading={exporting != null} onClick={() => void exportVideo()}>
                    {exporting != null ? `처리 중 ${Math.round(exporting * 100)}%` : "편집한 영상 저장 (소리 없음, H.264)"}
                  </Button>
                  {exporting != null && <span className="text-xs text-fg-subtle">화면을 다시 만드는 중이라 영상 길이에 따라 1~3분 걸릴 수 있습니다.</span>}
                </div>
                {exporting != null && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(exporting * 100)}%` }} />
                  </div>
                )}
                {done && <p className="text-xs text-success">{done}</p>}
                {exportError && <p className="text-xs text-danger">{exportError}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 화면 위에 상자 그리기·옮기기 */
function BoxCanvas({
  frame,
  width,
  height,
  scale,
  boxes,
  selected,
  newMode,
  t,
  onAdd,
  onMove,
  onSelect,
  busy,
}: {
  frame: string | null;
  width: number;
  height: number;
  scale: number;
  boxes: EditBox[];
  selected: string | null;
  newMode: EditMode;
  t: number;
  onAdd: (b: EditBox) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const W = Math.round(width * scale);
  const H = Math.round(height * scale);

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(e.clientX - r.left, W)), y: Math.max(0, Math.min(e.clientY - r.top, H)) };
  };

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair touch-none overflow-hidden rounded-control bg-fg select-none"
      style={{ width: W, height: H }}
      onPointerDown={(e) => {
        const p = point(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        onSelect(null);
        setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        const p = point(e);
        if (drag.current) {
          const b = boxes.find((x) => x.id === drag.current!.id);
          if (b) onMove(b.id, Math.round((p.x - drag.current.dx) / scale), Math.round((p.y - drag.current.dy) / scale));
        } else if (draft) setDraft({ ...draft, x1: p.x, y1: p.y });
      }}
      onPointerUp={() => {
        if (drag.current) {
          drag.current = null;
          return;
        }
        if (draft) {
          const x = Math.min(draft.x0, draft.x1);
          const y = Math.min(draft.y0, draft.y1);
          const w = Math.abs(draft.x1 - draft.x0);
          const h = Math.abs(draft.y1 - draft.y0);
          if (w > 6 && h > 6) {
            onAdd({ id: `${Date.now()}`, x: Math.round(x / scale), y: Math.round(y / scale), w: Math.round(w / scale), h: Math.round(h / scale), mode: newMode });
          }
          setDraft(null);
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {frame && <img src={frame} alt="영상 화면" draggable={false} className="pointer-events-none absolute inset-0 size-full" />}
      {busy && (
        <div className="absolute top-2 right-2 rounded bg-fg/70 px-2 py-0.5 text-[11px] text-white">
          <LoaderCircle className="mr-1 inline size-3 animate-spin" />
          화면 불러오는 중
        </div>
      )}
      {boxes.map((b, i) => {
        const active = b.start == null && b.end == null ? true : t >= (b.start ?? 0) && t <= (b.end ?? Infinity);
        return (
          <div
            key={b.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.parentElement?.setPointerCapture(e.pointerId);
              const p = point(e);
              drag.current = { id: b.id, dx: p.x - b.x * scale, dy: p.y - b.y * scale };
              onSelect(b.id);
            }}
            className={cn("absolute cursor-move border-2", MODE_COLOR[b.mode], selected === b.id && "ring-2 ring-white", !active && "opacity-35")}
            style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale }}
            title={`상자 ${i + 1} · ${MODE_LABEL[b.mode]}`}
          >
            <span className="absolute -top-5 left-0 rounded bg-fg/80 px-1 text-[10px] text-white">
              {i + 1} {MODE_LABEL[b.mode]}
            </span>
          </div>
        );
      })}
      {draft && (
        <div
          className={cn("absolute border-2 border-dashed", MODE_COLOR[newMode])}
          style={{
            left: Math.min(draft.x0, draft.x1),
            top: Math.min(draft.y0, draft.y1),
            width: Math.abs(draft.x1 - draft.x0),
            height: Math.abs(draft.y1 - draft.y0),
          }}
        />
      )}
    </div>
  );
}
