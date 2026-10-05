"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import type { ContentPublicationView } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { PUBLICATION_STATUSES, PUBLISH_PLATFORMS, dayKey, platformDot, platformLabel, publicationDate, statusLabel, statusTone } from "@/lib/publish-platforms";
import { Badge, Button, Drawer, EmptyState, ErrorState, FilterBar, FilterItem, IconButton, LoadingState, Select, cardClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PublicationForm } from "./PublicationForm";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const fmt = (n: number | null | undefined) => (n == null ? "-" : n.toLocaleString("ko-KR"));
const MAX_IN_CELL = 3;

/** 한국 시간 기준 오늘 (YYYY-MM-DD) */
const todayKey = () => dayKey(new Date().toISOString());

/** 달력 6주(42칸): 이번 달 1일이 있는 주의 일요일부터 */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * 업로드 관리: 월간 캘린더 (팀 전체).
 * 날짜 칸에는 그날 업로드(없으면 예약일)를 3개까지, 넘치면 "+N개 더보기". 날짜를 누르면 오른쪽 패널에 목록.
 */
export function UploadCalendar({ presetContentId }: { presetContentId?: string }) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [platform, setPlatform] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(Boolean(presetContentId));
  const [editing, setEditing] = useState<ContentPublicationView | null>(null);

  const days = useMemo(() => monthGrid(ym.year, ym.month), [ym]);
  // 앞뒤 주까지 보이므로 그 범위를 조회한다 (한국 시간 하루 앞뒤 여유)
  const range = useMemo(() => {
    const from = new Date(new Date(days[0]).getTime() - 86_400_000).toISOString();
    const to = new Date(new Date(days[41]).getTime() + 2 * 86_400_000).toISOString();
    return { from, to };
  }, [days]);
  const list = useAsync(() => api.publications.list(range.from, range.to), [range.from, range.to]);
  const all = list.data ?? [];

  const filtered = all.filter(
    (p) =>
      (!platform || p.platform === platform) &&
      (!product || (p.productName || "제품 없음") === product) &&
      (!status || p.status === status) &&
      (!assignee || (p.assigneeName || "-") === assignee),
  );
  const byDay = useMemo(() => {
    const map = new Map<string, ContentPublicationView[]>();
    for (const p of filtered) {
      const k = dayKey(publicationDate(p));
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [filtered]);

  const monthPrefix = `${ym.year}-${String(ym.month + 1).padStart(2, "0")}`;
  const inMonth = filtered.filter((p) => dayKey(publicationDate(p)).startsWith(monthPrefix));
  const productOptions = [...new Set(all.map((p) => p.productName || "제품 없음"))].sort();
  const assigneeOptions = [...new Set(all.map((p) => p.assigneeName || "-"))].sort();
  // 담당자별 이번 달 현황 (업로드 완료 · 예약)
  const perAssignee = assigneeOptions
    .map((name) => {
      const mine = inMonth.filter((p) => (p.assigneeName || "-") === name);
      return { name, published: mine.filter((p) => p.status === "published").length, scheduled: mine.filter((p) => p.status === "scheduled").length };
    })
    .filter((x) => x.published || x.scheduled);

  function move(delta: number) {
    setYm(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  async function remove(p: ContentPublicationView) {
    if (!window.confirm(`'${p.title}' 업로드 기록을 삭제할까요?`)) return;
    await api.publications.remove(p.id);
    list.setData((prev) => prev?.filter((x) => x.id !== p.id) ?? null);
  }

  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  // 날짜 패널을 열면 YouTube 업로드의 현재 조회수·좋아요·댓글 (+ 내 콘텐츠면 1일·7일 기록)
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.publications.stats>>>({});
  // YouTube 는 현재 숫자, 모든 업로드는 직접 넣은 조회수
  const ytIds = dayItems.map((p) => p.id).join(",");
  useEffect(() => {
    if (!ytIds) return;
    let active = true;
    api.publications
      .stats(ytIds.split(","))
      .then((r) => active && setStats((prev) => ({ ...prev, ...r })))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ytIds]);
  const today = todayKey();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="이전 달" onClick={() => move(-1)} />
          <h2 className="tabular min-w-[150px] text-center text-lg font-bold text-fg">
            {ym.year}년 {ym.month + 1}월
          </h2>
          <IconButton icon={ChevronRight} label="다음 달" onClick={() => move(1)} />
          <Button size="sm" variant="ghost" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() })}>
            오늘
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-fg-muted">
          <span>
            이번 달 <b className="text-fg">{inMonth.filter((p) => p.status === "published").length}</b>개 업로드 ·{" "}
            <b className="text-fg">{inMonth.filter((p) => p.status === "scheduled").length}</b>개 예약
          </span>
          <Button variant="primary" icon={Plus} onClick={openNew}>
            업로드 등록
          </Button>
        </div>
      </div>

      <FilterBar>
        <FilterItem label="플랫폼">
          <Select className="w-36" value={platform} placeholder="전체" options={PUBLISH_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} onChange={(e) => setPlatform(e.target.value)} />
        </FilterItem>
        <FilterItem label="제품">
          <Select className="w-48" value={product} placeholder="전체" options={productOptions.map((v) => ({ value: v, label: v }))} onChange={(e) => setProduct(e.target.value)} />
        </FilterItem>
        <FilterItem label="상태">
          <Select className="w-32" value={status} placeholder="전체" options={PUBLICATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))} onChange={(e) => setStatus(e.target.value)} />
        </FilterItem>
        <FilterItem label="담당자">
          <Select className="w-36" value={assignee} placeholder="전체" options={assigneeOptions.map((v) => ({ value: v, label: v }))} onChange={(e) => setAssignee(e.target.value)} />
        </FilterItem>
      </FilterBar>

      {perAssignee.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-fg-muted">
          {perAssignee.map((a) => (
            <span key={a.name} className="rounded-full border border-line bg-canvas px-3 py-1">
              {a.name} · 업로드 {a.published}
              {a.scheduled ? ` · 예약 ${a.scheduled}` : ""}
            </span>
          ))}
        </div>
      )}

      {list.loading ? (
        <LoadingState variant="skeleton" rows={6} />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : (
        <div className={cn(cardClass, "overflow-hidden")}>
          <div className="grid grid-cols-7 border-b border-line bg-subtle text-center text-xs font-medium text-fg-subtle">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={cn("py-2", i === 0 && "text-danger", i === 6 && "text-brand")}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const items = byDay.get(d) ?? [];
              const outside = !d.startsWith(monthPrefix);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={cn(
                    "flex min-h-[112px] flex-col gap-1 border-line p-1.5 text-left transition-colors hover:bg-brand-soft/40",
                    i % 7 !== 6 && "border-r",
                    i < 35 && "border-b",
                    outside && "bg-subtle/50",
                  )}
                >
                  <span
                    className={cn(
                      "tabular inline-flex size-6 items-center justify-center rounded-full text-xs",
                      outside ? "text-fg-subtle" : "text-fg-muted",
                      d === today && "bg-brand font-semibold text-white",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {items.slice(0, MAX_IN_CELL).map((p) => (
                    <span key={p.id} className={cn("flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11.5px] leading-tight", p.status === "published" ? "text-fg" : "text-fg-subtle")} title={`${platformLabel(p.platform)} · ${p.title}`}>
                      <span className={cn("size-1.5 shrink-0 rounded-full", platformDot(p.platform))} />
                      <span className="truncate">
                        {p.productName || p.title}
                        {p.status === "scheduled" ? " (예약)" : ""}
                      </span>
                    </span>
                  ))}
                  {items.length > MAX_IN_CELL && <span className="px-1 text-[11px] font-medium text-brand">+ {items.length - MAX_IN_CELL}개 더보기</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Drawer
        open={Boolean(selectedDay)}
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay ? (
            <span>
              {Number(selectedDay.slice(0, 4))}년 {Number(selectedDay.slice(5, 7))}월 {Number(selectedDay.slice(8))}일
              <span className="ml-2 text-sm font-normal text-fg-subtle">총 {dayItems.length}개</span>
            </span>
          ) : (
            ""
          )
        }
        footer={
          <Button
            variant="primary"
            icon={Plus}
            className="w-full"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            이 날짜로 업로드 등록
          </Button>
        }
      >
        {!dayItems.length ? (
          <EmptyState compact title="이 날은 업로드 기록이 없습니다" />
        ) : (
          <ul className="space-y-3">
            {dayItems.map((p) => (
              <li key={p.id} className="rounded-card border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                    <span className={cn("size-2 rounded-full", platformDot(p.platform))} />
                    {platformLabel(p.platform)}
                    {p.accountName && <span className="font-normal text-fg-subtle">· {p.accountName}</span>}
                  </span>
                  <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                </div>
                {p.productName && <p className="mt-2 text-xs text-fg-subtle">{p.productName}</p>}
                <p className="mt-0.5 text-sm font-medium text-fg">&ldquo;{p.title}&rdquo;</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  담당자: {p.assigneeName || "-"}
                  {p.contentType ? ` · ${p.contentType}` : ""}
                  {p.status === "scheduled" && p.scheduledAt ? ` · 예약 ${new Date(p.scheduledAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>
                {stats[p.id]?.manual && (
                  <p className="tabular mt-1.5 text-xs text-fg-muted">
                    직접 넣은 조회수 {fmt(stats[p.id].manual!.views)}
                    <span className="text-fg-subtle"> · {new Date(stats[p.id].manual!.at).toLocaleDateString("ko-KR")}</span>
                  </p>
                )}
                {stats[p.id]?.views != null && (
                  <p className="tabular mt-1.5 text-xs text-fg-muted">
                    지금 조회 {fmt(stats[p.id].views)} · 좋아요 {fmt(stats[p.id].likes)} · 댓글 {fmt(stats[p.id].comments)}
                    {(stats[p.id].d1 != null || stats[p.id].d7 != null) && (
                      <span className="text-fg-subtle">
                        {" "}
                        (1일 후 {fmt(stats[p.id].d1)} · 7일 후 {fmt(stats[p.id].d7)})
                      </span>
                    )}
                  </p>
                )}
                {p.note && <p className="mt-1.5 rounded-control bg-subtle px-2.5 py-1.5 text-xs text-fg-muted">{p.note}</p>}
                <div className="mt-3 flex items-center gap-1">
                  {p.platformUrl && (
                    <a href={p.platformUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-xs text-fg-muted hover:text-brand">
                      <ExternalLink className="size-3.5" />
                      {p.platform === "naver-blog" ? "글 보기" : "영상 보기"}
                    </a>
                  )}
                  <span className="flex-1" />
                  {p.canEdit && (
                    <IconButton
                      icon={Pencil}
                      label="수정"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    />
                  )}
                  {p.canDelete && <IconButton icon={Trash2} label="삭제" size="sm" className="hover:text-danger" onClick={() => void remove(p)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      {formOpen && (
        <PublicationForm
          open
          key={editing?.id ?? "new"}
          editing={editing}
          presetContentId={editing ? undefined : presetContentId}
          defaultDate={!editing && selectedDay ? new Date(`${selectedDay}T12:00:00+09:00`).toISOString() : undefined}
          onClose={() => setFormOpen(false)}
          onSaved={(saved) => {
            setFormOpen(false);
            list.setData((prev) => [...(prev ?? []).filter((x) => x.id !== saved.id), saved]);
            const d = new Date(publicationDate(saved));
            setYm({ year: d.getFullYear(), month: d.getMonth() });
          }}
        />
      )}
    </div>
  );
}
