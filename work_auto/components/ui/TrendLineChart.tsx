"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 단일 시계열 라인 차트 (검색 추이 등).
 * docs/DESIGN_SYSTEM.md "차트" 규칙:
 * - 단일 시리즈 → 범례 없음 (제목이 이름을 대신한다)
 * - 2px 라인 + 옅은 면적, 브랜드 단색
 * - 격자는 가로 기준선 3개만, 축 텍스트는 회색 보조 텍스트
 * - hover: 세로 크로스헤어 + 점 + 툴팁 (차트 전체가 hit 영역)
 * - 접근성: 같은 데이터를 sr-only 표로 제공
 */
export function TrendLineChart({
  data,
  height = 200,
  valueLabel = "검색 지수",
}: {
  data: { date: string; value: number }[];
  height?: number;
  valueLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) return null;

  const pad = { top: 12, right: 12, bottom: 24, left: 32 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = 100;
  const x = (i: number) => pad.left + (i / (data.length - 1)) * w;
  const y = (v: number) => pad.top + h - (v / max) * h;

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${pad.top + h} L${x(0)},${pad.top + h} Z`;
  const ticks = [0, 50, 100];
  const labelEvery = Math.ceil(data.length / 7);

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.min(data.length - 1, Math.max(0, Math.round(rel * (data.length - 1)))));
  }

  const hd = hover != null ? data[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg width={width} height={height} role="img" aria-label={`${valueLabel} 추이 차트`} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-fg-subtle text-[11px] tabular">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.date + i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-fg-subtle text-[11px] tabular">
              {d.date}
            </text>
          ) : null,
        )}
        <path d={area} fill="var(--color-brand)" opacity={0.08} />
        <path d={line} fill="none" stroke="var(--color-brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hd && hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} stroke="var(--color-line-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(hd.value)} r={5} fill="var(--color-brand)" stroke="var(--color-canvas)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={pad.left}
          y={pad.top}
          width={w}
          height={h}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hd && hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-control border border-line bg-canvas px-2.5 py-1.5 text-xs shadow-pop"
          style={{
            left: Math.min(width - 110, Math.max(0, x(hover) - 50)),
            top: Math.max(0, y(hd.value) - 52),
          }}
        >
          <p className="text-fg-subtle">{hd.date}</p>
          <p className="tabular font-semibold text-fg">
            {valueLabel} {hd.value}
          </p>
        </div>
      )}
      <table className="sr-only">
        <caption>{valueLabel} 추이</caption>
        <thead>
          <tr>
            <th>날짜</th>
            <th>{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{d.date}</td>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
