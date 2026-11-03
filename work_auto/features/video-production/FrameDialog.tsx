"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui";

export type Frame = { zoom: number; x: number; y: number };

/** 9:16 결과 미리보기에 확대·위치를 그대로 보여 주는 CSS (렌더의 자를 창과 같은 계산) */
export function frameStyle(f: Frame): React.CSSProperties {
  const z = Math.min(2.4, Math.max(1, f.zoom));
  const w = 1 / z;
  const x0 = Math.min(1 - w, Math.max(0, f.x - w / 2));
  const y0 = Math.min(1 - w, Math.max(0, f.y - w / 2));
  const ox = z > 1.001 ? (x0 / (1 - w)) * 100 : 50;
  const oy = z > 1.001 ? (y0 / (1 - w)) * 100 : 50;
  return { transform: `scale(${z})`, transformOrigin: `${ox}% ${oy}%` };
}

/**
 * v0.9.161 영상 기본 화면 정하기 (영상 URL 가져오기): 로고·글자가 안 보이게 확대·위치를 정해 두면 영상을 만들 때 그 화면으로 잘라 쓴다.
 * 영상 파일은 그대로 (다시 인코딩하지 않아 화질 손해 없음)
 */
export function FrameDialog({ videoId, title, initial, onClose, onSaved }: { videoId: string; title: string; initial: Frame | null; onClose: () => void; onSaved: (f: Frame | null) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [fr, setFr] = useState<Frame>(initial ?? { zoom: 1.3, x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; f: Frame } | null>(null);
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
  async function save(next: Frame | null) {
    setBusy(true);
    setErr(null);
    try {
      await api.videoProduction.setFrame(videoId, next);
      onSaved(next && next.zoom > 1.001 ? next : null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" role="dialog" aria-label="영상 화면 정하기" data-frame-dialog onClick={onClose}>
      <div className="w-full max-w-sm space-y-3 rounded-card bg-canvas p-4 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-[14px] font-semibold">영상 화면 정하기</p>
          <p className="truncate text-[12px] text-fg-muted">{title}</p>
        </div>
        <div
          className="relative mx-auto aspect-[9/16] max-h-[56vh] w-full cursor-grab overflow-hidden rounded bg-black active:cursor-grabbing"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, f: fr };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const box = e.currentTarget.getBoundingClientRect();
            setFr({ ...d.f, x: Number(Math.min(1, Math.max(0, d.f.x - (e.clientX - d.x) / box.width / d.f.zoom)).toFixed(3)), y: Number(Math.min(1, Math.max(0, d.f.y - (e.clientY - d.y) / box.height / d.f.zoom)).toFixed(3)) });
          }}
          onPointerUp={() => (drag.current = null)}
          data-frame-preview
        >
          {url ? (
            <video src={url} muted autoPlay loop playsInline className="pointer-events-none size-full object-cover" style={frameStyle(fr)} />
          ) : (
            <div className="flex size-full items-center justify-center p-4 text-center text-[12px] text-fg-subtle">{url === undefined ? "불러오는 중…" : "원본을 보관하지 않아 미리 볼 수 없습니다. 제품 상세 › 연결된 영상의 [다운로드]로 먼저 보관해 주세요."}</div>
          )}
          <span className="pointer-events-none absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">끌어서 위치 · {fr.zoom.toFixed(1)}배</span>
        </div>
        <label className="flex items-center gap-2 text-[12px]">
          확대
          <input type="range" min={1} max={2.4} step={0.1} value={fr.zoom} onChange={(e) => setFr({ ...fr, zoom: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--color-brand)]" aria-label="확대 배율" data-frame-zoom />
          <span className="tabular w-9 text-right">{fr.zoom.toFixed(1)}배</span>
        </label>
        <p className="text-[11.5px] text-fg-subtle">로고·글자가 안 보이게 맞추면, 이 영상을 쓰는 모든 컷이 이 화면으로 만들어집니다 (컷에서 따로 정하면 그쪽이 우선). 영상 파일은 그대로라 화질 손해가 없습니다.</p>
        {err && <p className="text-[12px] text-danger">{err}</p>}
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>
            자동으로 (지우기)
          </Button>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" variant="primary" loading={busy} disabled={!url} onClick={() => void save(fr)} data-frame-save>
              저장
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
