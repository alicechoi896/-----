"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FolderOpen, Pencil, Trash2 } from "lucide-react";
import type { SavedTrend, ScrapSource } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Badge, EmptyState, ErrorState, IconButton, Input, LoadingState, SectionCard, SegmentedControl, Select } from "@/components/ui";
import { MakeMenu } from "@/components/shared/MakeMenu";
import { infoVideoHref, productVideoHref } from "@/features/youtube-trends/trend-links";
import { cn, formatNumber, formatRelative } from "@/lib/utils";

const SOURCE_LABEL: Record<ScrapSource, string> = { youtube: "YouTube", naver: "NAVER", instagram: "Instagram" };
const ALL = "__all";
const NONE = "__none";

/**
 * 트렌드 스크랩 (v0.9.54) — 분류(폴더)별로 모아 보고, 옮기고, 지우고, 그 소재로 원고를 만든다. docs/SCRAPS.md
 */
export function ScrapBoard() {
  const data = useAsync(() => api.scraps.list(), []);
  const [folder, setFolder] = useState<string>(ALL);
  const [source, setSource] = useState<ScrapSource | "all">("all");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => data.data?.items ?? [], [data.data]);
  const folders = data.data?.folders ?? [];
  const shown = useMemo(
    () => items.filter((t) => (folder === ALL || (folder === NONE ? !t.folder : t.folder === folder)) && (source === "all" || t.source === source)),
    [items, folder, source],
  );
  const reload = () => data.reload();

  async function move(t: SavedTrend, to: string) {
    try {
      await api.scraps.move(t.id, to);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "옮기지 못했습니다.");
    }
  }
  async function remove(t: SavedTrend) {
    try {
      await api.scraps.remove(t.id);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "지우지 못했습니다.");
    }
  }
  async function rename() {
    if (!renaming) return;
    try {
      await api.scraps.renameFolder(renaming, newName.trim());
      if (folder === renaming) setFolder(newName.trim() || NONE);
      setRenaming(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "이름을 바꾸지 못했습니다.");
    }
  }

  if (data.loading) return <LoadingState variant="skeleton" rows={6} />;
  if (data.error) return <ErrorState message={data.error} onRetry={reload} />;

  const noneCount = items.filter((t) => !t.folder).length;
  const folderOptions = [{ value: "", label: "분류 없음" }, ...folders.map((f) => ({ value: f.name, label: f.name }))];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]" data-scraps>
      <SectionCard title="분류" icon={FolderOpen} flush>
        <ul className="py-1 text-[13px]">
          {[{ key: ALL, label: "전체", count: items.length }, { key: NONE, label: "분류 없음", count: noneCount }, ...folders.map((f) => ({ key: f.name, label: f.name, count: f.count }))].map((f) => (
            <li key={f.key} className="group flex items-center gap-1 px-2">
              {renaming === f.key ? (
                <form
                  className="flex w-full gap-1 py-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void rename();
                  }}
                >
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} className="h-8 text-[13px]" autoFocus aria-label="새 분류 이름" />
                </form>
              ) : (
                <>
                  <button type="button" onClick={() => setFolder(f.key)} className={cn("flex flex-1 items-center justify-between rounded px-2 py-2 text-left", folder === f.key ? "bg-brand-soft font-semibold text-brand" : "text-fg hover:bg-subtle")}>
                    <span className="truncate">{f.label}</span>
                    <span className="tabular text-xs text-fg-subtle">{f.count}</span>
                  </button>
                  {f.key !== ALL && f.key !== NONE && (
                    <IconButton icon={Pencil} size="sm" label={`'${f.label}' 이름 바꾸기`} onClick={() => (setRenaming(f.key), setNewName(f.label))} className="opacity-0 group-hover:opacity-100" />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11.5px] text-fg-subtle">새 분류는 트렌드 찾기의 [스크랩]에서 이름을 적어 만듭니다. 이름을 비우고 바꾸면 &lsquo;분류 없음&rsquo;으로 옮겨집니다.</p>
      </SectionCard>

      <SectionCard
        title={`${folder === ALL ? "전체" : folder === NONE ? "분류 없음" : folder} · ${shown.length}개`}
        actions={<SegmentedControl size="sm" options={[{ value: "all", label: "전체" }, { value: "youtube", label: "YouTube" }, { value: "naver", label: "NAVER" }, { value: "instagram", label: "Instagram" }]} value={source} onChange={setSource} />}
        flush
      >
        {error && <p className="px-5 pt-3 text-xs text-danger">{error}</p>}
        {shown.length === 0 ? (
          <EmptyState compact title="스크랩한 트렌드가 없습니다" description="YouTube·NAVER·Instagram 트렌드 찾기에서 책갈피 [스크랩]을 누르면 여기에 모입니다." />
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((t) => {
              const keywords = (t.keywords.length ? t.keywords : t.tags).slice(0, 6);
              return (
                <li key={t.id} className="flex items-start gap-3 px-5 py-3" data-scrap-item>
                  {t.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 플랫폼 썸네일 주소 그대로
                    <img src={t.thumbnailUrl} alt="" referrerPolicy="no-referrer" className={cn("shrink-0 rounded object-cover", t.format === "shorts" ? "h-16 w-10" : "h-12 w-20")} />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-subtle" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={t.source === "youtube" ? "danger" : t.source === "instagram" ? "brand" : "success"}>{SOURCE_LABEL[t.source]}</Badge>
                      <a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[13.5px] font-medium text-fg hover:text-brand">
                        {t.title} <ExternalLink className="inline size-3 text-fg-subtle" />
                      </a>
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {t.channelName && `${t.channelName} · `}
                      {t.views ? `조회 ${formatNumber(t.views)} · ` : ""}
                      스크랩 {formatRelative(t.createdAt)}
                    </p>
                    {keywords.length > 0 && <p className="mt-0.5 truncate text-xs text-fg-muted">{keywords.map((k) => `#${k}`).join(" ")}</p>}
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <Select value={t.folder ?? ""} options={folderOptions} onChange={(e) => void move(t, e.target.value)} aria-label="분류 옮기기" className="h-8 w-32 text-xs" />
                    <MakeMenu
                      label="만들기"
                      items={[
                        { label: "YouTube 제품 홍보 영상", href: productVideoHref({ trendTitle: t.title, keywords }) },
                        { label: "YouTube 정보성 영상", href: infoVideoHref({ trendTitle: t.title, keywords }) },
                        { label: "NAVER 정보성 클립", href: `/naver-clip/info-content?${new URLSearchParams({ trendTitle: t.title, keywords: keywords.join(", ") }).toString()}` },
                        { label: "NAVER 블로그 정보 글", href: `/naver-blog/info-writing?${new URLSearchParams({ topic: t.title }).toString()}` },
                      ]}
                    />
                    <IconButton icon={Trash2} size="sm" label="스크랩 삭제" onClick={() => void remove(t)} className="hover:text-danger" />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
