"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Clapperboard, Download, Film, Loader2, RefreshCw, ScrollText, Video, Wand2 } from "lucide-react";
import type { VideoChannel, VideoJob, VideoPlan, VideoSourceMode } from "@/lib/types/video-production";
import { VIDEO_STATUS_LABEL } from "@/lib/types/video-production";
import { api, type VideoProductionOptions } from "@/lib/api-client";
import { Badge, Button, Combobox, EmptyState, ErrorState, FormField, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select } from "@/components/ui";
import { PublicationForm } from "@/features/uploads/PublicationForm";
import { cn, formatRelative } from "@/lib/utils";

const RUNNING: VideoJob["status"][] = ["queued", "analyzing", "editing", "rendering", "quality_check"];
const TREATMENT_LABEL: Record<string, string> = { clean: "글자 없음", crop: "확대로 제거", blur: "블러", rejected: "확인 필요", unchecked: "검사 안 됨" };

/**
 * 영상 자동 제작 (v0.9.51) — YouTube·NAVER 클립 공통. docs/VIDEO_PRODUCTION.md
 * ① 대본 고르기(2단계 결과) → ② 영상 소재·음성 → [컷 계획 만들기] → ③ 컷 확인·클립 교체 → [영상 만들기] → ④ 결과·검수·승인
 */
export function VideoProductionWorkspace({ channelId, initialContentId }: { channelId: VideoChannel; initialContentId?: string }) {
  const [opts, setOpts] = useState<VideoProductionOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contentId, setContentId] = useState(initialContentId ?? "");
  const [scriptIndex, setScriptIndex] = useState(0);
  const [sourceMode, setSourceMode] = useState<VideoSourceMode>("xhs");
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [voice, setVoice] = useState("onyx");
  // 음성·자막 (4가지: 자막+음성 / 자막만 / 음성만 / 둘 다 없음)
  const [narrationOn, setNarrationOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<(VideoJob & { fileUrl?: string | null }) | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const busy = useRef(false);

  /** 대본을 고르면 제품 연결 영상을 먼저 골라 둔다 */
  const pickContent = useCallback((o: VideoProductionOptions, id: string) => {
    const c = o.contents.find((x) => x.id === id);
    setContentId(id);
    setScriptIndex(0);
    setPlan(null);
    if (!c) return;
    const linked = o.videos.filter((v) => c.productId && v.productId === c.productId).slice(0, 8);
    // 제품이 있는 원고는 그 제품의 영상만 쓴다
    setVideoIds((c.productId ? linked : o.videos.slice(0, 6)).map((v) => v.id));
  }, []);
  const load = useCallback(async () => {
    try {
      const [o, list] = await Promise.all([api.videoProduction.options(channelId), api.videoProduction.jobs(channelId)]);
      setOpts(o);
      setJobs(list);
      setVoice(o.voices[0]?.value ?? "onyx");
      pickContent(o, o.contents.some((c) => c.id === initialContentId) ? initialContentId! : (o.contents[0]?.id ?? ""));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [channelId, initialContentId, pickContent]);
  useEffect(() => {
    void (async () => load())();
  }, [load]);

  const content = opts?.contents.find((c) => c.id === contentId) ?? null;

  // 진행 중이면 3초마다 상태 확인
  useEffect(() => {
    if (!job || !RUNNING.includes(job.status)) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.videoProduction.get(job.id);
        setJob(next);
        if (!RUNNING.includes(next.status)) setJobs((prev) => [next, ...prev.filter((j) => j.id !== next.id)]);
      } catch {
        /* 다음에 다시 */
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [job]);

  async function makePlan() {
    if (busy.current || !content) return;
    busy.current = true;
    setPlanning(true);
    setError(null);
    try {
      const r = await api.videoProduction.plan({ contentId: content.id, scriptIndex, channelId, sourceMode, videoIds, voice, narrationOn, captions: captionsOn });
      setPlan(r.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "컷 계획을 만들지 못했습니다.");
    } finally {
      busy.current = false;
      setPlanning(false);
    }
  }

  async function render(p: VideoPlan, rerenderOf?: string) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const created = rerenderOf ? await api.videoProduction.rerender(rerenderOf, p) : await api.videoProduction.create(p);
      setJob(created);
      setJobs((prev) => [created, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "영상을 만들지 못했습니다.");
    } finally {
      busy.current = false;
    }
  }

  async function openJob(id: string) {
    try {
      setJob(await api.videoProduction.get(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!opts) return <LoadingState label="대본과 영상 소재를 불러오는 중입니다…" className="py-24" />;

  // 제품이 있는 원고면 그 제품에 연결된 영상만
  const sourceVideos = content?.productId ? opts.videos.filter((v) => v.productId === content.productId) : opts.videos;
  const videoTitle = (id: string | null) => opts.videos.find((v) => v.id === id)?.title ?? "자동";
  const missing = [
    !opts.ready.voice && "AI 음성(OpenAI 연결) — 없으면 음성 없이 자막 시간으로 만듭니다",
    !opts.ready.vision && "원본 글자 검사(AI 이미지 읽기: Claude·OpenAI 연결) — 없으면 모든 컷이 검수 필요",
    !opts.assets.bgm.length && "배경음악 (assets/video/bgm)",
    !opts.assets.sfx.length && "효과음 (assets/video/sfx)",
    Object.values(opts.assets.fonts).some((v) => !v) && "글꼴 (assets/video/fonts — 도현체·주아체·레시피코리아체)",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6" data-video-production>
      {missing.length > 0 && (
        <Notice tone="warning">
          아직 준비되지 않은 것: {missing.join(" · ")}. 빠진 것은 빼고 만듭니다.
        </Notice>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[440px_1fr]">
        <div className="space-y-6">
          {/* ① 대본 */}
          <SectionCard title="① 대본 고르기" icon={ScrollText} description="2단계에서 만든 제목별 대본 중 하나를 고릅니다. 제목·Hook·CTA 는 그대로 씁니다.">
            {opts.contents.length === 0 ? (
              <EmptyState
                compact
                title="영상 원고가 없습니다"
                description={`먼저 ${channelId === "youtube" ? "YouTube" : "NAVER 클립"} 제품 홍보·정보성 화면에서 2단계 대본을 만들어 주세요.`}
              />
            ) : (
              <div className="space-y-3">
                <FormField label="영상 원고 (제목)" htmlFor="vp-content">
                  <Combobox
                    id="vp-content"
                    value={contentId}
                    options={opts.contents.map((c) => ({ value: c.id, label: c.headline, description: `${c.productName ?? "제품 없음"} · ${formatRelative(c.createdAt)}` }))}
                    onChange={(id) => pickContent(opts, id)}
                    searchPlaceholder="제목으로 검색"
                  />
                </FormField>
                {content && (
                  <div className="space-y-2" data-script-picker>
                    {content.scripts.map((s, i) => (
                      <label
                        key={i}
                        className={cn("block cursor-pointer rounded-control border px-3 py-2 text-[12.5px]", scriptIndex === i ? "border-brand bg-brand-soft/50" : "border-line hover:bg-subtle")}
                      >
                        <span className="flex items-center gap-2 font-semibold text-fg">
                          <input type="radio" name="vp-script" checked={scriptIndex === i} onChange={() => setScriptIndex(i)} className="accent-[var(--color-brand)]" />
                          대본 {i + 1}
                        </span>
                        <span className="mt-1 line-clamp-3 block whitespace-pre-line text-fg-muted">{s}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ② 소재 */}
          <SectionCard title="② 영상 소재 · 음성" icon={Film}>
            <div className="space-y-4">
              <FormField label="소재" hint={sourceMode === "ai" ? "AI 영상 생성은 준비 중입니다 (업체 선정 후 연결). 지금은 샤오홍슈만·섞기를 써 주세요." : sourceMode === "mixed" ? "AI 영상이 준비되기 전까지는 샤오홍슈 영상으로만 채웁니다." : undefined}>
                <SegmentedControl
                  size="sm"
                  options={[
                    { value: "xhs", label: "샤오홍슈만" },
                    { value: "mixed", label: "섞기" },
                    { value: "ai", label: "AI만" },
                  ]}
                  value={sourceMode}
                  onChange={setSourceMode}
                />
              </FormField>
              <FormField
                label={`샤오홍슈 영상 · ${videoIds.length}개 고름`}
                hint={content?.productId ? `'${content.productName ?? "이 제품"}'에 연결된 영상만 보입니다. 다양할수록 같은 장면 반복이 줄어듭니다.` : "다양할수록 같은 장면 반복이 줄어듭니다."}
              >
                {sourceVideos.length === 0 ? (
                  <p className="text-[13px] text-fg-subtle">
                    {content?.productId ? "이 제품에 연결된 샤오홍슈 영상이 없습니다." : "저장된 샤오홍슈 영상이 없습니다."}{" "}
                    <Link href="/tools/video-import" className="font-medium text-brand hover:underline">
                      영상 URL 가져오기
                    </Link>
                    에서 {content?.productId ? "이 제품을 연결해 " : ""}먼저 담아 주세요.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1 overflow-y-auto" data-source-videos>
                    {sourceVideos.map((v) => {
                      const on = videoIds.includes(v.id);
                      return (
                        <li key={v.id}>
                          <label className={cn("flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-[12.5px]", on ? "bg-brand-soft/50" : "hover:bg-subtle")}>
                            <input type="checkbox" checked={on} onChange={() => setVideoIds((p) => (on ? p.filter((x) => x !== v.id) : [...p, v.id]))} className="accent-[var(--color-brand)]" />
                            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 썸네일 주소 그대로 (최적화 비용 없음) */}
                            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="size-9 shrink-0 rounded object-cover" /> : <Video className="size-4 shrink-0 text-fg-subtle" />}
                            <span className="min-w-0 flex-1 truncate text-fg">{v.title}</span>
                            {content?.productId && v.productId === content.productId && <Badge tone="brand">제품</Badge>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </FormField>
              <FormField label="음성 · 자막">
                <div className="flex flex-wrap gap-4 text-[13px]" data-av-options>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={narrationOn} onChange={(e) => setNarrationOn(e.target.checked)} className="accent-[var(--color-brand)]" />
                    AI 음성 넣기
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={captionsOn} onChange={(e) => setCaptionsOn(e.target.checked)} className="accent-[var(--color-brand)]" />
                    자막 넣기
                  </label>
                </div>
              </FormField>
              {narrationOn && (
                <FormField label="AI 음성 목소리">
                  <Select value={voice} options={opts.voices.map((v) => ({ value: v.value, label: v.label }))} onChange={(e) => setVoice(e.target.value)} />
                </FormField>
              )}
              {!narrationOn && <p className="-mt-2 text-xs text-fg-subtle">음성이 없으면 컷 길이는 자막 글자 수로 정합니다 (배경음악·효과음은 그대로).</p>}
              {error && !plan && <Notice tone="warning">{error}</Notice>}
              <Button variant="primary" icon={Wand2} loading={planning} disabled={!content || !videoIds.length || sourceMode === "ai"} onClick={() => void makePlan()} className="w-full" data-make-plan>
                컷 계획 만들기
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {job ? (
            <JobPanel key={`${job.id}:${job.updatedAt}`} job={job} plan={plan} videoTitle={videoTitle} videos={opts.videos} onRerender={(p) => void render(p, job.id)} onChange={setJob} />
          ) : plan ? (
            <PlanEditor plan={plan} onChange={setPlan} videos={opts.videos.filter((v) => plan.sourceVideoIds.includes(v.id))} onRender={() => void render(plan)} error={error} />
          ) : (
            <SectionCard>
              <EmptyState icon={Clapperboard} title="컷 계획을 만들어 주세요" description="대본·소재를 고르고 [컷 계획 만들기]를 누르면 컷마다 자막·클립·효과음이 나옵니다. 확인한 뒤 [영상 만들기]를 누르세요." className="py-20" />
            </SectionCard>
          )}

          <SectionCard title="최근 만든 영상" icon={Film} flush>
            {jobs.length === 0 ? (
              <EmptyState compact title="아직 만든 영상이 없습니다" />
            ) : (
              <ul className="divide-y divide-line">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => void openJob(j.id)} className={cn("flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-subtle", job?.id === j.id && "bg-brand-soft/50")}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{j.plan.selectedTitle}</span>
                        <span className="text-xs text-fg-subtle">
                          컷 {j.plan.scenes.length}개 · {formatRelative(j.createdAt)}
                          {j.qa.fileDeleted ? " · 파일 정리됨" : j.qa.downloadedAt ? " · 다운로드함" : ""}
                        </span>
                      </span>
                      <StatusBadge status={j.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: VideoJob["status"] }) {
  const tone = status === "completed" || status === "approved" ? "success" : status === "needs_review" ? "warning" : status === "failed" ? "danger" : "info";
  return <Badge tone={tone}>{VIDEO_STATUS_LABEL[status]}</Badge>;
}

function PlanEditor({ plan, onChange, videos, onRender, error }: { plan: VideoPlan; onChange: (p: VideoPlan) => void; videos: VideoProductionOptions["videos"]; onRender: () => void; error: string | null }) {
  const setScene = (i: number, patch: Partial<VideoPlan["scenes"][number]>) => onChange({ ...plan, scenes: plan.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  return (
    <SectionCard
      title={`③ 컷 계획 · ${plan.scenes.length}컷`}
      icon={Clapperboard}
      description="한 줄 = 한 컷 = 자막 한 줄입니다. 클립은 자동으로 나눠 두었고, 바꿀 수 있습니다. 원본 글자는 렌더할 때 검사해 글자 없는 구간 → 확대 → 블러 → 제외 순으로 처리합니다."
      data-plan-editor
    >
      <div className="mb-4 overflow-hidden rounded-control border border-line">
        <div className="bg-black px-4 py-3 text-center">
          <Input value={plan.topLine1} onChange={(e) => onChange({ ...plan, topLine1: e.target.value })} className="h-9 border-0 bg-transparent text-center text-lg font-bold text-white" aria-label="상단 제목 1줄" />
          <Input value={plan.topLine2} onChange={(e) => onChange({ ...plan, topLine2: e.target.value })} className="h-8 border-0 bg-transparent text-center font-bold text-[#C8FF00]" aria-label="상단 제목 2줄" />
        </div>
        <p className="bg-subtle px-3 py-1.5 text-[11.5px] text-fg-subtle">상단 제목 (고정 디자인 · 도현체). 선택한 제목: {plan.selectedTitle}</p>
      </div>
      <ol className="space-y-1.5">
        {plan.scenes.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_200px] items-center gap-2 rounded-control border border-line px-2 py-1.5 text-[12.5px]" data-plan-scene>
            <span className="tabular text-center text-xs font-semibold text-fg-subtle">{i + 1}</span>
            <span className="min-w-0">
              <Input value={s.narration} onChange={(e) => setScene(i, { narration: e.target.value })} className="h-8 text-[13px]" aria-label={`${i + 1}번 컷 자막`} />
              <span className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-fg-subtle">
                {s.sfx && <Badge tone="info">효과음 {s.sfx}</Badge>}
                {s.arrow && <Badge tone="brand">↓ 제품 버튼 화살표</Badge>}
                {i === plan.scenes.length - 1 && plan.ending && <Badge tone="danger">최저가 구매링크</Badge>}
              </span>
            </span>
            <Select
              value={s.sourceVideoId ?? ""}
              options={videos.map((v) => ({ value: v.id, label: v.title.slice(0, 22) }))}
              onChange={(e) => setScene(i, { sourceVideoId: e.target.value, pinned: true })}
              aria-label={`${i + 1}번 컷 클립`}
            />
          </li>
        ))}
      </ol>
      {error && <Notice tone="warning" className="mt-3">{error}</Notice>}
      <div className="mt-4 flex justify-end">
        <Button variant="primary" icon={Film} onClick={onRender} data-render>
          영상 만들기
        </Button>
      </div>
    </SectionCard>
  );
}

function JobPanel({
  job,
  plan,
  videoTitle,
  videos,
  onRerender,
  onChange,
}: {
  job: VideoJob & { fileUrl?: string | null };
  plan: VideoPlan | null;
  videoTitle: (id: string | null) => string;
  videos: VideoProductionOptions["videos"];
  onRerender: (p: VideoPlan) => void;
  onChange: (j: VideoJob & { fileUrl?: string | null }) => void;
}) {
  const running = RUNNING.includes(job.status);
  // 작업이 바뀌면 key 로 다시 그려 편집 상태를 새로 시작한다 (JobPanel key = id·갱신 시각)
  const [edited, setEdited] = useState<VideoPlan>(job.plan);
  const [note, setNote] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const changed = JSON.stringify(edited.scenes.map((s) => s.sourceVideoId)) !== JSON.stringify(job.plan.scenes.map((s) => s.sourceVideoId));
  const pool = videos.filter((v) => job.plan.sourceVideoIds.includes(v.id));

  async function download() {
    setNote(null);
    try {
      const { url } = await api.videoProduction.download(job.id);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${job.plan.selectedTitle.slice(0, 40)}.mp4`;
      a.click();
      setNote("다운로드를 시작했습니다. 1회 다운로드라 1시간 뒤 서버에서 지웁니다.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "받지 못했습니다.");
    }
  }
  async function approve() {
    try {
      onChange({ ...(await api.videoProduction.approve(job.id)), fileUrl: job.fileUrl });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "승인하지 못했습니다.");
    }
  }

  return (
    <SectionCard title="④ 영상" icon={Film} actions={<StatusBadge status={job.status} />} data-job-panel>
      {running ? (
        <div className="py-12 text-center" data-job-running>
          <Loader2 className="mx-auto size-6 animate-spin text-brand" />
          <p className="mt-3 text-[14px] font-semibold text-fg">{VIDEO_STATUS_LABEL[job.status]}</p>
          <div className="mx-auto mt-3 h-2 max-w-xs overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(5, job.progress)}%` }} />
          </div>
          <p className="mt-2 text-xs text-fg-subtle">보통 1~3분 걸립니다. 이 화면을 닫아도 계속 만듭니다. 샤오홍슈 원본은 만들 때만 임시로 받고, 끝나면 바로 지웁니다.</p>
        </div>
      ) : job.status === "failed" ? (
        <div className="space-y-3">
          <Notice tone="warning">{job.error ?? "영상을 만들지 못했습니다."}</Notice>
          <Button icon={RefreshCw} onClick={() => onRerender(job.plan)}>
            다시 만들기
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div>
            {job.fileUrl ? (
              <video src={job.fileUrl} controls playsInline className="aspect-[9/16] w-full rounded-control bg-black" data-video-preview />
            ) : (
              <div className="flex aspect-[9/16] items-center justify-center rounded-control bg-subtle p-4 text-center text-xs text-fg-subtle">{job.qa.fileDeleted ? "파일이 정리되었습니다 (1회 다운로드·7일 보관)." : "미리보기를 불러오지 못했습니다."}</div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Download} disabled={job.qa.fileDeleted} onClick={() => void download()} data-download>
                다운로드 (1회)
              </Button>
              {job.status !== "approved" ? (
                <Button size="sm" icon={Check} onClick={() => void approve()}>
                  검수 완료
                </Button>
              ) : (
                <Button size="sm" icon={CalendarPlus} onClick={() => setScheduleOpen(true)}>
                  업로드 예약하기
                </Button>
              )}
            </div>
            {note && <p className="mt-2 text-xs text-fg-muted">{note}</p>}
          </div>
          <div className="min-w-0 space-y-3">
            {job.qa.issues.length > 0 ? (
              <Notice tone="warning">
                <ul className="list-disc space-y-0.5 pl-4">
                  {job.qa.issues.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice tone="info">자동 검사를 모두 통과했습니다.</Notice>
            )}
            <p className="text-xs text-fg-subtle">
              길이 {job.qa.durationSec ?? "-"}초 · 효과음 {job.qa.sfxCount ?? 0}회 · 검은 화면 {job.qa.blackFrames ?? 0} · 긴 무음 {job.qa.longSilences ?? 0} · 음성 {job.qa.voice === "tts" ? "AI" : "없음"}
            </p>
            <ol className="space-y-1" data-job-scenes>
              {edited.scenes.map((s, i) => (
                <li key={i} className={cn("grid grid-cols-[24px_minmax(0,1fr)_170px] items-center gap-2 rounded-control border px-2 py-1.5 text-[12px]", s.issue ? "border-warning bg-warning-soft/40" : "border-line")}>
                  <span className="tabular text-center text-fg-subtle">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-fg">{s.narration}</span>
                    <span className="text-[11px] text-fg-subtle">
                      {s.start != null ? `${s.start.toFixed(1)}초 · ` : ""}
                      {TREATMENT_LABEL[s.textTreatment ?? "unchecked"]}
                      {s.issue ? ` · ${s.issue}` : ""}
                    </span>
                  </span>
                  <Select
                    value={s.sourceVideoId ?? ""}
                    options={pool.map((v) => ({ value: v.id, label: v.title.slice(0, 20) }))}
                    onChange={(e) => setEdited({ ...edited, scenes: edited.scenes.map((x, j) => (j === i ? { ...x, sourceVideoId: e.target.value, pinned: true } : x)) })}
                    aria-label={`${i + 1}번 컷 클립 교체`}
                  />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant={changed ? "primary" : "secondary"} icon={RefreshCw} onClick={() => onRerender(edited)}>
                {changed ? "바꾼 클립으로 다시 만들기" : "다시 만들기"}
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">원본 {[...new Set(job.plan.scenes.map((s) => s.sourceVideoId))].map(videoTitle).join(", ").slice(0, 120)}</p>
          </div>
        </div>
      )}
      {scheduleOpen && (
        <PublicationForm open onClose={() => setScheduleOpen(false)} editing={null} presetContentId={job.contentId ?? undefined} presetStatus="scheduled" onSaved={() => setScheduleOpen(false)} />
      )}
      {plan && null}
    </SectionCard>
  );
}
