"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Clapperboard, Download, Film, ImagePlus, Loader2, Play, RefreshCw, ScrollText, Sparkles, Video, Wand2 } from "lucide-react";
import type { AiClip, VideoChannel, VideoJob, VideoPlan, VideoSourceMode } from "@/lib/types/video-production";
import { VIDEO_STATUS_LABEL, aiSourceId, isAiSource } from "@/lib/types/video-production";
import { AI_CLIP_CONFIG, CAPTION_COLORS, CAPTION_FONTS, CAPTION_SIZES, CAPTION_STROKES, DEFAULT_CAPTION_STYLE, estimateAiClipUsd, type CaptionStyle } from "@/lib/video-production/config";
import { shrinkImage } from "@/lib/image-shrink";
import { api, type VideoProductionOptions } from "@/lib/api-client";
import { Badge, Button, Combobox, EmptyState, ErrorState, FormField, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { PublicationForm } from "@/features/uploads/PublicationForm";
import { cn, formatRelative } from "@/lib/utils";

const RUNNING: VideoJob["status"][] = ["queued", "analyzing", "editing", "rendering", "quality_check"];
const TREATMENT_LABEL: Record<string, string> = { clean: "글자 없음", crop: "확대로 제거", blur: "블러", rejected: "확인 필요", unchecked: "검사 안 됨" };
const CLIP_STATE: Record<AiClip["state"], { label: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  draft: { label: "만들기 전", tone: "neutral" },
  waiting: { label: "대기 중", tone: "info" },
  generating: { label: "만드는 중", tone: "info" },
  success: { label: "완료", tone: "success" },
  fail: { label: "실패", tone: "danger" },
};
const PENDING = (c: AiClip) => c.state === "waiting" || c.state === "generating";
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `vp-${Date.now()}`);
/** AI 컷 작업 번호는 화면을 닫아도 잃지 않게 이 브라우저에만 (비밀값 아님, 결과는 Kie 에 14일) */
const clipKey = (contentId: string, scriptIndex: number) => `vp-ai-clips:${contentId}:${scriptIndex}`;
function loadClips(key: string): AiClip[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AiClip[]) : null;
  } catch {
    return null;
  }
}
function saveClips(key: string, clips: AiClip[] | undefined) {
  try {
    if (clips?.some((c) => c.taskId)) localStorage.setItem(key, JSON.stringify(clips));
  } catch {
    /* 저장 못 해도 계속 */
  }
}
const clipLabel = (c: AiClip) => `AI 컷 ${c.id.slice(2)} · ${c.mode === "product" ? "제품" : "장면"}`;

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
  const [aiCount, setAiCount] = useState<number>(AI_CLIP_CONFIG.defaultCount);
  const [voiceStyle, setVoiceStyle] = useState("shorts");
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [aiPrompt, setAiPrompt] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
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
      const r = await api.videoProduction.plan({ contentId: content.id, scriptIndex, channelId, sourceMode: sourceMode, videoIds: sourceMode === "ai" ? [] : videoIds, voice, narrationOn, captions: captionsOn, aiCount, voiceStyle, captionStyle, aiPrompt });
      // 같은 대본으로 이미 만든 AI 컷이 있으면 이어서 쓴다 (다시 과금하지 않게)
      const saved = r.plan.aiClips?.length ? loadClips(clipKey(content.id, scriptIndex)) : null;
      if (saved && r.plan.aiClips && saved.length === r.plan.aiClips.length) r.plan.aiClips = saved;
      setPlan(r.plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "컷 계획을 만들지 못했습니다.");
    } finally {
      busy.current = false;
      setPlanning(false);
    }
  }

  /** 목소리 미리 듣기 (OpenAI TTS 1회) */
  async function previewVoice() {
    if (previewing) return;
    setPreviewing(true);
    setVoiceNote(null);
    try {
      const blob = await api.videoProduction.voicePreview({ voice, voiceStyle, channelId, text: content?.scripts[scriptIndex]?.split("\n").find((l) => l.trim())?.slice(0, 60) });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setVoiceNote(e instanceof Error ? e.message : "목소리를 불러오지 못했습니다.");
    } finally {
      setPreviewing(false);
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
  const videoTitle = (id: string | null) => (isAiSource(id) ? `AI 컷 ${id!.slice(5)}` : (opts.videos.find((v) => v.id === id)?.title ?? "자동"));
  const usesAi = sourceMode !== "xhs";
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
              <FormField
                label="소재"
                hint={sourceMode === "ai" ? "모든 컷을 AI 컷으로 채웁니다 (AI 컷을 돌아가며 씀)." : sourceMode === "mixed" ? "AI 컷을 고르게 넣고 나머지는 샤오홍슈 영상으로 채웁니다." : undefined}
              >
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
              {usesAi && (
                <FormField
                  label="AI 컷 수"
                  htmlFor="vp-ai-count"
                  hint={`영상 1개에 넣을 AI 컷 (1~${AI_CLIP_CONFIG.maxCount}개, 컷 1개 = 5초). 제품 사진 → 움직이는 영상은 1개 약 $${((AI_CLIP_CONFIG.product.credits ?? 0) * AI_CLIP_CONFIG.creditUsd).toFixed(2)}. 컷 계획에서 [AI 컷 만들기]를 누를 때만 과금됩니다.`}
                >
                  <Input
                    id="vp-ai-count"
                    type="number"
                    min={1}
                    max={AI_CLIP_CONFIG.maxCount}
                    value={aiCount}
                    onChange={(e) => setAiCount(Math.max(1, Math.min(AI_CLIP_CONFIG.maxCount, Number(e.target.value) || 1)))}
                    className="w-28"
                    data-ai-count
                  />
                </FormField>
              )}
              {usesAi && (
                <FormField label="AI 컷 공통 프롬프트 (선택)" htmlFor="vp-ai-prompt" hint="모든 AI 컷에 함께 넣는 큰 설명입니다. 분위기·장소·인물·카메라·색감을 자세히 써 주세요 (한국어 OK, 최대 2,000자). 사람이 나오면 현대 한국인으로 만듭니다.">
                  <Textarea
                    id="vp-ai-prompt"
                    rows={4}
                    value={aiPrompt}
                    maxLength={2000}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="예: 서울 신축 아파트 거실, 오후 햇살, 20~30대 한국인 부부, 깔끔한 화이트톤 인테리어, 손 클로즈업 위주, 부드러운 카메라 이동"
                    className="text-[12.5px]"
                    data-ai-prompt
                  />
                </FormField>
              )}
              {usesAi && !opts.ready.videoAi && (
                <Notice tone="warning">
                  AI 컷을 만들려면 <Link href="/settings/api" className="font-medium text-brand hover:underline">API 연결 센터</Link>에서 <b>Kie AI</b> 키를 연결해 주세요.
                </Notice>
              )}
              {sourceMode !== "ai" && (
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
              )}
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
                <div className="grid gap-3 sm:grid-cols-2" data-voice-options>
                  <FormField label={`AI 음성 목소리 · ${opts.voices.length}가지`}>
                    <Select value={voice} options={opts.voices.map((v) => ({ value: v.value, label: v.label }))} onChange={(e) => setVoice(e.target.value)} />
                  </FormField>
                  <FormField label="말투">
                    <Select value={voiceStyle} options={opts.voiceStyles} onChange={(e) => setVoiceStyle(e.target.value)} />
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button size="sm" icon={Play} loading={previewing} disabled={!opts.ready.voice} onClick={() => void previewVoice()} data-voice-preview>
                      미리 듣기
                    </Button>
                    <span className="ml-2 text-[11.5px] text-fg-subtle">{opts.ready.voice ? "고른 대본 첫 줄로 들려 줍니다 (OpenAI 음성 1회)." : "OpenAI 키를 연결하면 들을 수 있습니다."}</span>
                    {voiceNote && <p className="mt-1 text-xs text-danger">{voiceNote}</p>}
                  </div>
                </div>
              )}
              {captionsOn && <CaptionStylePicker value={captionStyle} onChange={setCaptionStyle} />}
              {!narrationOn && <p className="-mt-2 text-xs text-fg-subtle">음성이 없으면 컷 길이는 자막 글자 수로 정합니다 (배경음악·효과음은 그대로).</p>}
              {error && !plan && <Notice tone="warning">{error}</Notice>}
              <Button variant="primary" icon={Wand2} loading={planning} disabled={!content || (sourceMode === "xhs" && !videoIds.length)} onClick={() => void makePlan()} className="w-full" data-make-plan>
                컷 계획 만들기
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {job ? (
            <JobPanel key={`${job.id}:${job.updatedAt}`} job={job} plan={plan} videoTitle={videoTitle} videos={opts.videos} onRerender={(p) => void render(p, job.id)} onChange={setJob} />
          ) : plan ? (
            <PlanEditor
              plan={plan}
              onChange={(p) => {
                setPlan(p);
                if (content) saveClips(clipKey(content.id, scriptIndex), p.aiClips);
              }}
              videos={opts.videos.filter((v) => plan.sourceVideoIds.includes(v.id))}
              images={content?.images ?? []}
              videoAiReady={opts.ready.videoAi}
              onRender={() => void render(plan)}
              error={error}
            />
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

function PlanEditor({
  plan,
  onChange,
  videos,
  images,
  videoAiReady,
  onRender,
  error,
}: {
  plan: VideoPlan;
  onChange: (p: VideoPlan) => void;
  videos: VideoProductionOptions["videos"];
  images: string[];
  videoAiReady: boolean;
  onRender: () => void;
  error: string | null;
}) {
  const setScene = (i: number, patch: Partial<VideoPlan["scenes"][number]>) => onChange({ ...plan, scenes: plan.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const clips = plan.aiClips ?? [];
  const usedAi = new Set(plan.scenes.map((s) => s.sourceVideoId).filter(isAiSource));
  const notReady = clips.filter((c) => usedAi.has(aiSourceId(c.id)) && c.state !== "success");
  const clipOptions = [...clips.map((c) => ({ value: aiSourceId(c.id), label: clipLabel(c) })), ...videos.map((v) => ({ value: v.id, label: v.title.slice(0, 22) }))];
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
      {clips.length > 0 && <AiClipPanel plan={plan} onChange={onChange} images={images} ready={videoAiReady} />}
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
              options={clipOptions}
              onChange={(e) => setScene(i, { sourceVideoId: e.target.value, pinned: true })}
              aria-label={`${i + 1}번 컷 클립`}
            />
          </li>
        ))}
      </ol>
      {error && <Notice tone="warning" className="mt-3">{error}</Notice>}
      <div className="mt-4 flex items-center justify-end gap-3">
        {notReady.length > 0 && <span className="text-xs text-fg-subtle">AI 컷 {notReady.map((c) => c.id.slice(2)).join(", ")}번이 다 만들어지면 누를 수 있습니다.</span>}
        <Button variant="primary" icon={Film} onClick={onRender} disabled={notReady.length > 0} data-render>
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
  const pool = [
    ...(job.plan.aiClips ?? []).filter((c) => c.state === "success").map((c) => ({ value: aiSourceId(c.id), label: clipLabel(c) })),
    ...videos.filter((v) => job.plan.sourceVideoIds.includes(v.id)).map((v) => ({ value: v.id, label: v.title.slice(0, 20) })),
  ];

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
                    options={pool}
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

/**
 * AI 컷 (v0.9.60, Kie AI): 컷마다 '제품 사진 → 움직이는 영상' 또는 '글 → 장면'.
 * [AI 컷 만들기] 1번 = 아직 안 만든(또는 실패한) 컷 수만큼 과금. 상태 확인은 무료 — 만드는 중이면 20초마다 확인한다.
 */
function AiClipPanel({ plan, onChange, images, ready }: { plan: VideoPlan; onChange: (p: VideoPlan) => void; images: string[]; ready: boolean }) {
  const clips = plan.aiClips ?? [];
  const [busy, setBusy] = useState<"make" | "check" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  }, [plan]);
  const todo = clips.filter((c) => !c.taskId || c.state === "fail");
  const pending = clips.some(PENDING);
  const est = estimateAiClipUsd(todo.map((c) => c.mode));
  const spent = clips.reduce((n, c) => n + (c.credits ?? 0), 0);
  const setClip = (id: string, patch: Partial<AiClip>) => onChange({ ...plan, aiClips: clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const [uploadingClip, setUploadingClip] = useState<string | null>(null);
  // 직접 올린 사진도 다른 컷에서 고를 수 있게
  const allImages = [...new Set([...images, ...clips.map((c) => c.imageUrl).filter((u): u is string => Boolean(u))])];
  async function uploadFor(c: AiClip, file: File | undefined) {
    if (!file) return;
    setUploadingClip(c.id);
    setNote(null);
    try {
      const { imageUrl } = await api.videoProduction.aiClipImage(await shrinkImage(file), plan.channelId);
      setClip(c.id, { imageUrl, mode: "product" });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setUploadingClip(null);
    }
  }

  const merge = useCallback(
    (next: AiClip[]) => {
      const p = planRef.current;
      const byId = new Map(next.map((c) => [c.id, c]));
      onChange({ ...p, aiClips: (p.aiClips ?? []).map((c) => byId.get(c.id) ?? c) });
    },
    [onChange],
  );

  async function make() {
    if (busy || !todo.length) return;
    setBusy("make");
    setNote(null);
    try {
      const r = await api.videoProduction.aiClips(plan, newId());
      merge(r.clips);
      const failed = r.clips.filter((c) => c.state === "fail");
      setNote(`AI 컷 ${r.created}개를 만들기 시작했습니다 (보통 1~5분).${failed.length ? ` 실패 ${failed.length}개: ${failed[0].error ?? ""}` : ""}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "AI 컷을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const check = useCallback(async () => {
    const now = planRef.current.aiClips ?? [];
    if (!now.some(PENDING)) return;
    setBusy((b) => b ?? "check");
    try {
      merge((await api.videoProduction.aiClipStatus(now)).clips);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "상태를 확인하지 못했습니다.");
    } finally {
      setBusy((b) => (b === "check" ? null : b));
    }
  }, [merge]);

  // 만드는 중이면 20초마다 상태 확인 (무료 API)
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void check(), 20_000);
    return () => clearInterval(timer);
  }, [pending, check]);

  return (
    <div className="mb-4 rounded-control border border-brand-line bg-brand-soft/30 p-3" data-ai-clips>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          <Sparkles className="size-4 text-brand" /> AI 컷 {clips.length}개 <span className="font-normal text-fg-subtle">(Kie AI · 5초 · 소리 없음)</span>
        </p>
        <span className="flex items-center gap-2">
          {pending && (
            <Button size="sm" icon={RefreshCw} loading={busy === "check"} onClick={() => void check()}>
              상태 확인
            </Button>
          )}
          <Button size="sm" variant="primary" icon={Sparkles} loading={busy === "make"} disabled={!ready || !todo.length || Boolean(busy)} onClick={() => void make()} data-ai-make>
            {todo.length ? `AI 컷 만들기 (${todo.length}개${est.usd ? ` · 약 $${est.usd.toFixed(2)}` : ""}${est.unknown ? ` · 장면 ${est.unknown}개는 끝난 뒤 실제 비용 표시` : ""})` : "AI 컷 모두 요청함"}
          </Button>
        </span>
      </div>
      <Textarea
        value={plan.aiPrompt ?? ""}
        onChange={(e) => onChange({ ...plan, aiPrompt: e.target.value.slice(0, 2000) })}
        rows={3}
        className="mb-2 text-[12.5px]"
        aria-label="AI 컷 공통 프롬프트"
        placeholder="공통 프롬프트 (모든 AI 컷에 적용): 분위기·장소·인물·카메라·색감을 자세히 — 사람은 현대 한국인으로 만듭니다"
      />
      <ul className="space-y-2">
        {clips.map((c) => {
          const locked = Boolean(c.taskId) && c.state !== "fail";
          const st = CLIP_STATE[c.state];
          return (
            <li key={c.id} className="rounded-control border border-line bg-canvas p-2.5" data-ai-clip>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] font-semibold text-fg">AI 컷 {c.id.slice(2)}</span>
                <Badge tone={st.tone}>
                  {PENDING(c) && <Loader2 className="mr-1 inline size-3 animate-spin" />}
                  {st.label}
                </Badge>
                {c.credits != null && <span className="text-[11px] text-fg-subtle">{c.credits} 크레딧 (약 ${(c.credits * AI_CLIP_CONFIG.creditUsd).toFixed(2)})</span>}
                <span className="ml-auto">
                  <SegmentedControl
                    size="sm"
                    value={c.mode}
                    onChange={(m) => !locked && setClip(c.id, { mode: m, imageUrl: m === "product" ? (c.imageUrl ?? images[0] ?? null) : null })}
                    options={[
                      { value: "product", label: "제품 사진 → 움직임" },
                      { value: "text", label: "글 → 장면" },
                    ]}
                  />
                </span>
              </div>
              {c.mode === "product" &&
                (allImages.length || !locked ? (
                  <div className="mb-1.5 flex gap-1.5 overflow-x-auto" data-ai-images>
                    {!locked && (
                      <label className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded border border-dashed border-line text-fg-subtle hover:border-brand hover:text-brand" title="제품 사진 올리기" data-ai-upload>
                        {uploadingClip === c.id ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void uploadFor(c, e.target.files?.[0])} aria-label={`AI 컷 ${c.id.slice(2)} 제품 사진 올리기`} />
                      </label>
                    )}
                    {allImages.map((u) => (
                      <button
                        key={u}
                        type="button"
                        disabled={locked}
                        onClick={() => setClip(c.id, { imageUrl: u })}
                        className={cn("size-12 shrink-0 overflow-hidden rounded border-2", c.imageUrl === u ? "border-brand" : "border-transparent opacity-70 hover:opacity-100")}
                        aria-label="이 제품 사진 쓰기"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- 제품 사진 주소 그대로 */}
                        <img src={u} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mb-1.5 text-[11.5px] text-warning">이 제품에 사진이 없습니다. 사진을 올리거나 &lsquo;글 → 장면&rsquo;으로 바꿔 주세요.</p>
                ))}
              <Textarea
                value={c.prompt}
                onChange={(e) => setClip(c.id, { prompt: e.target.value })}
                disabled={locked}
                rows={3}
                maxLength={500}
                className="text-[12.5px]"
                aria-label={`AI 컷 ${c.id.slice(2)} 장면 설명`}
                placeholder={c.mode === "product" ? "예: 사람이 거실에서 이 청소기로 바닥을 미는 모습" : "예: 아침 햇살이 드는 깔끔한 원룸"}
              />
              {c.error && <p className="mt-1 text-[11.5px] text-danger">{c.error}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-fg-subtle">
        한국어로 써도 됩니다 (만들 때 AI 가 영어 프롬프트로 바꿉니다). 만든 컷은 실패하지 않는 한 다시 과금하지 않습니다.{spent ? ` 지금까지 ${spent} 크레딧 (약 $${(spent * AI_CLIP_CONFIG.creditUsd).toFixed(2)}).` : ""}
        {!ready && " Kie AI 키를 연결하면 만들 수 있습니다."}
      </p>
      {note && <p className="mt-1 text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

/** 자막 글꼴·글자색·테두리색·크기 (v0.9.63) — 영상에는 서버가 같은 값으로 그린다 */
function CaptionStylePicker({ value, onChange }: { value: CaptionStyle; onChange: (v: CaptionStyle) => void }) {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });
  const shadow = value.stroke === "none" ? "none" : [-3, 3].flatMap((x) => [-3, 3].map((y) => `${x}px ${y}px 0 ${value.stroke}`)).join(",");
  return (
    <div className="space-y-2.5 rounded-control border border-line p-3" data-caption-style>
      <p className="text-[13px] font-semibold text-fg">자막 스타일</p>
      <div className="flex items-center justify-center rounded bg-gradient-to-b from-zinc-600 to-zinc-800 py-4">
        <span style={{ color: value.color, textShadow: shadow, fontSize: CAPTION_SIZES.find((x) => x.value === value.size)!.size / 3.2 }} className="font-black">
          이거 하나면 청소 끝
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={value.font} options={CAPTION_FONTS.map((f) => ({ value: f.value, label: f.label }))} onChange={(e) => set({ font: e.target.value as CaptionStyle["font"] })} aria-label="자막 글꼴" />
        <SegmentedControl size="sm" value={value.size} onChange={(v) => set({ size: v })} options={CAPTION_SIZES.map((x) => ({ value: x.value, label: x.label }))} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">글자색</span>
        {CAPTION_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => set({ color: c })} aria-label={`글자색 ${c}`} className={cn("size-6 rounded-full border", value.color === c ? "ring-2 ring-brand ring-offset-1" : "border-line")} style={{ background: c }} />
        ))}
        <input type="color" value={value.color} onChange={(e) => set({ color: e.target.value.toUpperCase() })} aria-label="글자색 직접 고르기" className="size-7 cursor-pointer rounded border border-line bg-transparent" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">테두리</span>
        {CAPTION_STROKES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set({ stroke: c })}
            aria-label={c === "none" ? "테두리 없음" : `테두리색 ${c}`}
            className={cn("flex size-6 items-center justify-center rounded-full border text-[9px] text-fg-subtle", value.stroke === c ? "ring-2 ring-brand ring-offset-1" : "border-line")}
            style={c === "none" ? undefined : { background: c }}
          >
            {c === "none" ? "없음" : ""}
          </button>
        ))}
        {value.stroke !== "none" && <input type="color" value={value.stroke} onChange={(e) => set({ stroke: e.target.value.toUpperCase() })} aria-label="테두리색 직접 고르기" className="size-7 cursor-pointer rounded border border-line bg-transparent" />}
      </div>
      <p className="text-[11px] text-fg-subtle">미리보기는 색만 맞춘 것입니다. 글꼴은 영상에 고른 글꼴로 들어갑니다.</p>
    </div>
  );
}
