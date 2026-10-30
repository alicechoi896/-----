"use client";

import { useCallback, useEffect, useState } from "react";
import { Clapperboard, FlaskConical, FolderOpen, Plus } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, LoadingState, SectionCard, Select, Tabs } from "@/components/ui";
import { DramaTestWorkspace } from "@/features/drama-test/DramaTestWorkspace";
import { DEFAULT_SETTINGS, GENRES, MOODS, STEPS, TARGET_SECONDS } from "@/lib/drama-studio/steps";
import type { DramaProjectSummary, DramaSettings, StepKey } from "@/lib/drama-studio/types";
import { formatRelative } from "@/lib/utils";
import { studioApi } from "./api";
import { StudioShell } from "./StudioShell";
import { TextField } from "./ui";

/**
 * AI 드라마 스튜디오 (v0.9.81) — /tools/drama-test. docs/DRAMA_STUDIO.md
 * 탭: 드라마 스튜디오(8단계 제작) · 모델 비교 시험(기존 AI 드라마 시험, 그대로)
 * 열어 둔 프로젝트는 주소(?project=)에 남겨 새로고침·재접속해도 이어서 연다.
 */
type Tab = "studio" | "compare";
const START_OPTIONS: { value: StepKey; label: string; hint: string }[] = [
  { value: "ideas", label: "처음부터 (아이디어 → 영상)", hint: "아이디어 20개부터" },
  { value: "scenario", label: "시나리오부터", hint: "시나리오 글을 붙여 넣거나 장면을 직접 쓰기 (인물은 4단계에서 직접 입력)" },
  { value: "sheets", label: "캐릭터 시트부터", hint: "인물을 직접 입력하고 기준 이미지 올리기" },
  { value: "storyboard", label: "스토리보드 이미지부터", hint: "이미 만든 장면 이미지 여러 장을 한 번에 올리기" },
  { value: "video", label: "영상 편집부터", hint: "이미 만든 영상 클립을 올려 타임라인 편집·병합" },
];

export function DramaStudio() {
  const [tab, setTab] = useState<Tab>("studio");
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
  return (
    <div className="space-y-5" data-drama-studio>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "studio", label: "드라마 스튜디오", icon: Clapperboard },
          { value: "compare", label: "모델 비교 시험", icon: FlaskConical },
        ]}
      />
      {tab === "compare" ? <DramaTestWorkspace /> : openId ? <StudioShell id={openId} onClose={() => openProject(null)} /> : <ProjectHome onOpen={openProject} />}
    </div>
  );
}

function ProjectHome({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<DramaProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [settings, setSettings] = useState<DramaSettings>(DEFAULT_SETTINGS);
  const [start, setStart] = useState<StepKey>("ideas");
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try {
      setList((await studioApi.home()).projects);
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
      const r = await studioApi.create({ title, settings, startStep: start });
      onOpen(r.project.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }
  const set = (patch: Partial<DramaSettings>) => setSettings((s) => ({ ...s, ...patch }));
  if (error && !list) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <SectionCard title="새 드라마 만들기" icon={Plus} description="아이디어만 있으면 8단계로 영상까지 만듭니다. 이미 만든 시나리오·이미지·영상이 있으면 중간부터 시작할 수 있습니다." data-new-project>
        <div className="space-y-3">
          <TextField label="프로젝트 이름" value={title} onChange={setTitle} placeholder="예: 마지막 문자" />
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">시작 단계</span>
            <Select value={start} options={START_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} onChange={(e) => setStart(e.target.value as StepKey)} aria-label="시작 단계" />
            <span className="text-[11.5px] text-fg-subtle">{START_OPTIONS.find((o) => o.value === start)?.hint}</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">장르</span>
              <Select value={settings.genre} options={GENRES.map((g) => ({ value: g, label: g }))} onChange={(e) => set({ genre: e.target.value })} aria-label="장르" />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">분위기</span>
              <Select value={settings.mood} options={MOODS.map((g) => ({ value: g, label: g }))} onChange={(e) => set({ mood: e.target.value })} aria-label="분위기" />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">목표 영상 길이</span>
              <Select value={String(settings.targetSec)} options={TARGET_SECONDS.map((s) => ({ value: String(s), label: s >= 60 ? `${s / 60}분${s % 60 ? ` ${s % 60}초` : ""}` : `${s}초` }))} onChange={(e) => set({ targetSec: Number(e.target.value) })} aria-label="목표 길이" />
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">화면 비율</span>
              <Select value={settings.aspect} options={[{ value: "9:16", label: "9:16 세로 (쇼츠)" }, { value: "16:9", label: "16:9 가로" }]} onChange={(e) => set({ aspect: e.target.value as DramaSettings["aspect"] })} aria-label="화면 비율" />
            </label>
          </div>
          <Button variant="primary" icon={Plus} loading={creating} onClick={() => void create()} className="w-full" data-create-project>
            프로젝트 만들기
          </Button>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </SectionCard>
      <SectionCard title="내 드라마 프로젝트" icon={FolderOpen} flush>
        {!list ? (
          <LoadingState className="py-16" />
        ) : !list.length ? (
          <EmptyState compact title="아직 프로젝트가 없습니다" description="왼쪽에서 새 드라마를 만들어 주세요." />
        ) : (
          <ul className="divide-y divide-line" data-project-list>
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-subtle">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{p.title}</span>
                    <span className="text-xs text-fg-subtle">
                      {STEPS.find((s) => s.key === p.currentStep)?.no} {STEPS.find((s) => s.key === p.currentStep)?.label} · 승인 {p.approved}/8 · {formatRelative(p.updatedAt)}
                    </span>
                  </span>
                  <Badge tone="brand">이어서 작업</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
