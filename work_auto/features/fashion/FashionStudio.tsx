"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FolderOpen, Plus, Shirt, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Input, LoadingState, SectionCard } from "@/components/ui";
import type { FashionProjectSummary } from "@/lib/fashion/types";
import { formatRelative } from "@/lib/utils";
import { fashionApi } from "./api";
import { FashionEditor } from "./FashionEditor";
import { useFashion } from "./useFashion";

/**
 * AI 패션 피드·릴스 (v0.9.103) — /instagram/fashion. docs/FASHION.md
 * 열어 둔 프로젝트는 주소(?project=)에 남겨 새로고침해도 이어서 연다.
 */
export function FashionStudio() {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    void Promise.resolve().then(() => setOpenId(new URLSearchParams(window.location.search).get("project")));
  }, []);
  const openProject = useCallback((id: string | null) => {
    setOpenId(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("project", id);
    else u.searchParams.delete("project");
    window.history.replaceState(null, "", u.toString());
  }, []);
  return <div data-fashion-studio>{openId ? <ProjectView id={openId} onClose={() => openProject(null)} /> : <Home onOpen={openProject} />}</div>;
}

const THEMES = ["출근룩", "데이트룩", "하객룩", "주말 나들이룩", "가을 데일리룩", "공항룩", "모녀 커플룩"];

function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<FashionProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [theme, setTheme] = useState(THEMES[0]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try {
      setList((await fashionApi.home()).projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, []);
  useEffect(() => {
    void (async () => load())();
  }, [load]);
  async function create() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      onOpen((await fashionApi.create({ title, theme })).project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }
  if (error && !list) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <SectionCard title="새 패션 콘텐츠" icon={Plus} description="상품 → 모델 → 배경·문구 → 룩 이미지 → 피드·릴스. 레퍼런스 릴스처럼 같은 모델·같은 배경에서 옷만 바뀌게 만듭니다." data-new-fashion>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">프로젝트 이름 (비우면 AI 가 지어 줌)</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 가을 출근룩 6가지" />
          </label>
          <div className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">주제</span>
            <div className="flex flex-wrap gap-1.5">
              {THEMES.map((t) => (
                <button key={t} type="button" onClick={() => setTheme(t)} className={`rounded-full px-2.5 py-1 text-[12.5px] ring-1 ring-inset ${theme === t ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-muted ring-line hover:bg-subtle"}`}>
                  {t}
                </button>
              ))}
            </div>
            <Input value={theme} onChange={(e) => setTheme(e.target.value)} className="mt-1.5 h-9" aria-label="주제 직접 쓰기" />
          </div>
          <Button variant="primary" icon={Plus} loading={creating} onClick={() => void create()} className="w-full" data-create-fashion>
            프로젝트 만들기
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </SectionCard>
      <SectionCard title="내 패션 프로젝트" icon={FolderOpen}>
        {!list ? (
          <LoadingState />
        ) : !list.length ? (
          <EmptyState compact title="아직 프로젝트가 없습니다" description="왼쪽에서 새로 만들어 주세요." />
        ) : (
          <ul className="divide-y divide-line" data-fashion-list>
            {list.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5">
                <Shirt className="size-4 text-fg-subtle" />
                <button type="button" className="min-w-0 flex-1 truncate text-left text-[14px] font-medium hover:text-brand" onClick={() => onOpen(x.id)}>
                  {x.title}
                </button>
                <Badge tone="neutral">룩 {x.looks}개</Badge>
                <span className="text-[12px] text-fg-subtle">{formatRelative(x.updatedAt)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  aria-label="목록에서 빼기"
                  onClick={async () => {
                    if (!window.confirm(`'${x.title}'을 목록에서 뺄까요?`)) return;
                    await fashionApi.remove(x.id).catch(() => undefined);
                    void load();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ProjectView({ id, onClose }: { id: string; onClose: () => void }) {
  const ctl = useFashion(id);
  if (!ctl.project) return ctl.error ? <ErrorState message={ctl.error} onRetry={() => void ctl.reload()} /> : <LoadingState />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={onClose}>
          목록
        </Button>
        <Input value={ctl.project.title} onChange={(e) => ctl.edit("title", e.target.value)} className="h-9 max-w-md font-semibold" aria-label="프로젝트 이름" />
        <span className="text-[12px] text-fg-subtle">{ctl.saveState === "saving" ? "저장 중…" : ctl.saveState === "dirty" ? "저장 대기" : ctl.saveState === "error" ? "저장 실패" : "저장됨"}</span>
      </div>
      <FashionEditor ctl={ctl} />
    </div>
  );
}
