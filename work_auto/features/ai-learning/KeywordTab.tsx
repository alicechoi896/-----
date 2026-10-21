"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, EyeOff, Eye, Pin, PinOff, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, Minus, Sparkles } from "lucide-react";
import type { KeywordOrigin, TrendKeywordView } from "@/lib/types/keyword-library";
import { KEYWORD_LIFETIME_DAYS, KEYWORD_ORIGIN_LABEL } from "@/lib/types/keyword-library";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, Button, Combobox, EmptyState, ErrorState, IconButton, Input, LoadingState, Notice, SearchInput, SectionCard, SegmentedControl } from "@/components/ui";
import { cn, formatNumber, formatRelative } from "@/lib/utils";

type View = "rising" | "product" | "all" | "expiring" | "archived";
const VIEWS: { value: View; label: string }[] = [
  { value: "rising", label: "뜨는 키워드" },
  { value: "product", label: "제품별" },
  { value: "all", label: "전체" },
  { value: "expiring", label: "만료 예정" },
  { value: "archived", label: "보관함" },
];
const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus, new: Sparkles };
const TREND_LABEL = { up: "상승", down: "하락", flat: "유지", new: "새로 나옴" };

/**
 * AI 학습 관리 › 키워드 관리 (v0.9.56). docs/KEYWORD_LIBRARY.md
 * 자동(트렌드 찾기·원고 생성·스크랩) + 직접 추가. 마지막으로 본 날 + 6개월이 지나면 보관함 (고정 제외).
 */
export function KeywordTab() {
  const data = useAsync(() => api.keywords.list(), []);
  const products = useAsync(() => api.products.list(), []);
  const [view, setView] = useState<View>("rising");
  const [productId, setProductId] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  // 직접 추가
  const [newKw, setNewKw] = useState("");
  const [newProduct, setNewProduct] = useState("");

  const rows = useMemo(() => data.data ?? [], [data.data]);
  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name, description: p.brand }));
  const shown = useMemo(() => {
    const text = q.trim().toLowerCase();
    let list = rows.filter((k) => (view === "archived" ? k.status === "archived" : k.status === "active"));
    if (view === "rising") list = list.filter((k) => !k.hidden && (k.trend === "up" || k.trend === "new"));
    if (view === "product") list = list.filter((k) => (productId ? k.productId === productId : Boolean(k.productId)));
    if (view === "expiring") list = list.filter((k) => k.daysLeft != null && k.daysLeft <= 14);
    if (text) list = list.filter((k) => k.keyword.toLowerCase().includes(text) || k.aliases.some((a) => a.toLowerCase().includes(text)) || (k.productName ?? "").toLowerCase().includes(text));
    const score = (k: TrendKeywordView) => (k.trend === "up" ? 3 : k.trend === "new" ? 2 : k.trend === "flat" ? 1 : 0) * 1000 + k.recent;
    return view === "rising" ? [...list].sort((a, b) => score(b) - score(a)) : list;
  }, [rows, view, productId, q]);

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ tone: "info", text: ok });
      data.reload();
    } catch (e) {
      setNote({ tone: "warning", text: e instanceof Error ? e.message : "처리하지 못했습니다." });
    } finally {
      setBusy(false);
    }
  }
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < 5) n.add(id);
      return n;
    });

  if (data.loading) return <LoadingState variant="skeleton" rows={6} />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;

  const counts = {
    rising: rows.filter((k) => k.status === "active" && !k.hidden && (k.trend === "up" || k.trend === "new")).length,
    expiring: rows.filter((k) => k.status === "active" && k.daysLeft != null && k.daysLeft <= 14).length,
    archived: rows.filter((k) => k.status === "archived").length,
  };

  return (
    <div className="space-y-4" data-keyword-tab>
      <p className="text-[13px] text-fg-subtle">
        트렌드 찾기(YouTube·NAVER·Instagram)·원고 생성·스크랩에서 본 키워드가 <b className="font-medium text-fg-muted">자동으로</b> 모이고, 직접 넣을 수도 있습니다. 제품에 연결해 두면 원고 생성 화면에서 그 제품의 뜨는 키워드를 바로 추천합니다.
        마지막으로 본 날부터 {KEYWORD_LIFETIME_DAYS / 30}개월이 지나면 보관함으로 옮깁니다 (고정한 키워드는 그대로).
      </p>

      <SectionCard title="키워드 직접 추가" icon={Plus}>
        <form
          className="grid gap-2 md:grid-cols-[minmax(0,1fr)_260px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (newKw.trim()) void act(() => api.keywords.add({ keyword: newKw, productId: newProduct || null }), "추가했습니다.").then(() => setNewKw(""));
          }}
        >
          <Input value={newKw} onChange={(e) => setNewKw(e.target.value)} placeholder="키워드 (쉼표로 여러 개) 예: 아이폰듀오, 아이폰 Pro18" aria-label="새 키워드" />
          <Combobox value={newProduct} options={productOptions} onChange={setNewProduct} placeholder="연결 제품 (선택)" searchPlaceholder="제품 검색" clearable />
          <Button type="submit" variant="primary" icon={Plus} loading={busy} disabled={!newKw.trim()}>
            추가
          </Button>
        </form>
        <p className="mt-1.5 text-xs text-fg-subtle">띄어쓰기·대소문자·순서·&lsquo;프로/Pro&rsquo; 표기가 달라도 같은 키워드로 묶습니다 (예: 아이폰18프로 = 아이폰 Pro18 = iPhone 18 Pro).</p>
      </SectionCard>

      <SectionCard
        title={`${VIEWS.find((v) => v.value === view)?.label} · ${shown.length}개`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              options={VIEWS.map((v) => ({ value: v.value, label: v.value === "rising" ? `${v.label} ${counts.rising}` : v.value === "expiring" ? `${v.label} ${counts.expiring}` : v.value === "archived" ? `${v.label} ${counts.archived}` : v.label }))}
              value={view}
              onChange={(v) => (setView(v), setPicked(new Set()))}
            />
          </div>
        }
        flush
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <SearchInput value={q} onValueChange={setQ} placeholder="키워드·제품 이름으로 찾기" className="w-64" />
          {view === "product" && <Combobox value={productId} options={productOptions} onChange={setProductId} placeholder="제품 고르기 (비우면 연결된 것 전체)" searchPlaceholder="제품 검색" clearable className="w-72" />}
          <span className="ml-auto flex items-center gap-2 text-xs text-fg-subtle">
            {picked.size}개 고름 (최대 5)
            <Button size="sm" icon={RefreshCw} loading={busy} disabled={!picked.size} onClick={() => void act(() => api.keywords.interest([...picked]), "관심도를 갱신했습니다 (NAVER 데이터랩 1회).")} title="고른 키워드의 NAVER 데이터랩 상대 관심도 (최근 12주, 검색량 아님)">
              관심도 갱신
            </Button>
          </span>
        </div>
        {note && <Notice tone={note.tone} className="mx-5 mt-3">{note.text}</Notice>}
        {shown.length === 0 ? (
          <EmptyState compact title="키워드가 없습니다" description={view === "rising" ? "트렌드 찾기에서 검색하거나 원고를 만들면 키워드가 모입니다." : "조건에 맞는 키워드가 없습니다."} />
        ) : (
          <ul className="divide-y divide-line" data-keyword-list>
            {shown.slice(0, 300).map((k) => {
              const Icon = TREND_ICON[k.trend];
              return (
                <li key={k.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-2.5", k.hidden && "opacity-50")} data-keyword-row>
                  <input type="checkbox" checked={picked.has(k.id)} onChange={() => toggle(k.id)} className="size-4 accent-[var(--color-brand)]" aria-label="고르기" />
                  <div className="min-w-48 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium text-fg">
                      {k.pinned && <Pin className="size-3.5 text-brand" />}
                      {k.keyword}
                      <span className={cn("inline-flex items-center gap-0.5 text-xs", k.trend === "up" ? "text-success" : k.trend === "down" ? "text-danger" : k.trend === "new" ? "text-brand" : "text-fg-subtle")}>
                        <Icon className="size-3.5" />
                        {TREND_LABEL[k.trend]}
                      </span>
                      {k.interest && (
                        <Badge tone="info" className="font-normal">
                          관심도 {k.interest.value}
                          {k.interest.direction === "up" ? "↑" : k.interest.direction === "down" ? "↓" : ""}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      최근 2주 {k.recent}회 · 마지막 {formatRelative(k.lastSeenAt)}
                      {k.views ? ` · 최고 조회 ${formatNumber(k.views)}` : ""}
                      {k.daysLeft != null && ` · 만료까지 ${k.daysLeft}일`}
                      {k.aliases.length > 0 && ` · 같은 말: ${k.aliases.slice(0, 3).join(", ")}`}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-1">
                      {(Object.entries(k.sources) as [KeywordOrigin, number][]).map(([o, n]) => (
                        <span key={o} className="rounded bg-subtle px-1.5 py-px text-[10.5px] text-fg-muted">
                          {KEYWORD_ORIGIN_LABEL[o]} {n}
                        </span>
                      ))}
                    </p>
                  </div>
                  <Combobox
                    value={k.productId ?? ""}
                    options={productOptions}
                    onChange={(v) => void act(() => api.keywords.update(k.id, { productId: v || null }))}
                    placeholder="제품 연결"
                    searchPlaceholder="제품 검색"
                    clearable
                    className="w-56"
                  />
                  <span className="flex items-center">
                    <IconButton icon={k.pinned ? PinOff : Pin} size="sm" label={k.pinned ? "고정 풀기" : "고정 (만료 안 됨)"} onClick={() => void act(() => api.keywords.update(k.id, { pinned: !k.pinned }))} />
                    <IconButton icon={k.hidden ? Eye : EyeOff} size="sm" label={k.hidden ? "다시 보이기" : "숨기기 (추천에서 빼기)"} onClick={() => void act(() => api.keywords.update(k.id, { hidden: !k.hidden }))} />
                    {k.status === "archived" ? (
                      <IconButton icon={ArchiveRestore} size="sm" label="다시 쓰기" onClick={() => void act(() => api.keywords.update(k.id, { status: "active" }))} />
                    ) : (
                      <IconButton icon={Archive} size="sm" label="보관함으로" onClick={() => void act(() => api.keywords.update(k.id, { status: "archived" }))} />
                    )}
                    <IconButton icon={Trash2} size="sm" label="삭제" onClick={() => void act(() => api.keywords.remove(k.id))} className="hover:text-danger" />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {shown.length > 300 && <p className="px-5 py-3 text-xs text-fg-subtle">처음 300개만 보입니다. 검색으로 좁혀 주세요.</p>}
      </SectionCard>
    </div>
  );
}
