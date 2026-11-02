"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarPlus, PanelLeftClose, PanelLeftOpen, Check, Clapperboard, Download, Film, Loader2, Play, RefreshCw, ScrollText, Video, Wand2 } from "lucide-react";
import type { VideoChannel, VideoJob, VideoPlan } from "@/lib/types/video-production";
import { VIDEO_STATUS_LABEL, isAiSource } from "@/lib/types/video-production";
import {
  CAPTION_COLORS,
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_SIZES,
  CAPTION_STROKES,
  DEFAULT_CAPTION_STYLE,
  DEFAULT_TITLE_STYLE,
  DEFAULT_PAUSE,
  DEFAULT_VOICE_SPEED,
  GIF_POSITIONS,
  GIF_SIZES,
  PAUSE_OPTIONS,
  TITLE_BAR_COLORS,
  VIDEO_TARGETS,
  VOICE_SPEEDS,
  type CaptionStyle,
  type TitleStyle,
} from "@/lib/video-production/config";
import { api, type VideoProductionOptions } from "@/lib/api-client";
import { Badge, Button, Combobox, EmptyState, ErrorState, FormField, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { PublicationForm } from "@/features/uploads/PublicationForm";
import { GiphyPicker } from "./GiphyPicker";
import { THUMB_MAX, cutThumb, thumbLen } from "@/lib/video-production/thumb";
import { cn, formatRelative } from "@/lib/utils";

const RUNNING: VideoJob["status"][] = ["queued", "analyzing", "editing", "rendering", "quality_check"];
const VOICE_PREFS_KEY = "vp-voice-prefs:v1";
/** 미리보기 글꼴 (v0.9.78): 영상에 쓰는 글꼴 파일을 그대로 받아 미리보기도 같은 글꼴로 */
const previewFont = (key: string | undefined) => ({ fontFamily: `"vp-${key ?? "pretendard"}", "Pretendard", sans-serif`, fontWeight: key === "pretendard" ? 900 : 400 });
const FONT_FACES = CAPTION_FONTS.map((f) => `@font-face{font-family:"vp-${f.value}";src:url(/api/video-production/font/${f.value});font-display:swap}`).join("");
const TREATMENT_LABEL: Record<string, string> = { clean: "글자 없음", crop: "확대로 제거", blur: "블러", rejected: "확인 필요", unchecked: "검사 안 됨" };
/**
 * 영상 자동 제작 (v0.9.51) — YouTube·NAVER 클립 공통. docs/VIDEO_PRODUCTION.md
 * ① 대본 고르기(2단계 결과) → ② 영상 소재·음성 → [컷 계획 만들기] → ③ 컷 확인·클립 교체 → [영상 만들기] → ④ 결과·검수·승인
 */
export function VideoProductionWorkspace({ channelId, initialContentId, initialJobId, autoLink }: { channelId: VideoChannel; initialContentId?: string; initialJobId?: string; autoLink?: { date: string; itemId: string } }) {
  // v0.9.138 영상 제목·섬네일 제목 (섬네일 = 영상 상단 제목 2번째 줄, 공백 빼고 10자 이내)
  const [titleText, setTitleText] = useState("");
  // v0.9.139 왼쪽 접기 (오른쪽 결과 화면을 넓게)
  const [leftOpen, setLeftOpen] = useState(true);
  const [thumbText, setThumbText] = useState("");
  const [opts, setOpts] = useState<VideoProductionOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contentId, setContentId] = useState(initialContentId ?? "");
  const [scriptIndex, setScriptIndex] = useState(0);
  // v0.9.82: 대본 직접 고치기 (null = 고른 원고 그대로). 엔터 = 컷 나누기
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [voice, setVoice] = useState("onyx");
  // 음성 엔진 (v0.9.73): OpenAI | 타입캐스트. 타입캐스트 목소리는 tc_… id. v0.9.75: 기본 타입캐스트
  const [ttsEngine, setTtsEngine] = useState<"openai" | "typecast">("typecast");
  const [tcVoice, setTcVoice] = useState("");
  const [tcEmotion, setTcEmotion] = useState("normal");
  // 음성·자막 (4가지: 자막+음성 / 자막만 / 음성만 / 둘 다 없음)
  const [narrationOn, setNarrationOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [voiceStyle, setVoiceStyle] = useState("shorts");
  const [voiceSpeed, setVoiceSpeed] = useState<number>(DEFAULT_VOICE_SPEED);
  const [targetSec, setTargetSec] = useState<number>(15);
  const [maxPause, setMaxPause] = useState<number>(DEFAULT_PAUSE);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>(DEFAULT_CAPTION_STYLE);
  const [titleStyle, setTitleStyle] = useState<TitleStyle>(DEFAULT_TITLE_STYLE);
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
    setScriptText(null);
    setPlan(null);
    if (!c) return;
    setTitleText(c.title ?? c.headline);
    setThumbText(cutThumb(c.thumbPick ?? c.thumbs?.[0] ?? ""));
    // 영상 길이 기본값 = 대본을 만들 때 고른 길이
    setTargetSec(c.targetSec);
    const linked = o.videos.filter((v) => c.productId && v.productId === c.productId).slice(0, 8);
    // 제품이 있는 원고는 그 제품의 영상만 쓴다
    setVideoIds((c.productId ? linked : o.videos.slice(0, 6)).map((v) => v.id));
  }, []);
  const load = useCallback(async () => {
    try {
      const [o, list] = await Promise.all([api.videoProduction.options(channelId), api.videoProduction.jobs(channelId)]);
      setOpts(o);
      // 타입캐스트 키가 없으면 OpenAI 로 (기본은 타입캐스트)
      if (!o.ready.typecast) setTtsEngine("openai");
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

  // v0.9.75: 음성 엔진·타입캐스트 목소리·감정·속도·무음은 이 브라우저에 기억 (비밀값 아님)
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const p = JSON.parse(localStorage.getItem(VOICE_PREFS_KEY) ?? "null") as Record<string, unknown> | null;
        if (p) {
          if (p.ttsEngine === "openai" || p.ttsEngine === "typecast") setTtsEngine(p.ttsEngine);
          if (typeof p.tcVoice === "string") setTcVoice(p.tcVoice);
          if (typeof p.tcEmotion === "string") setTcEmotion(p.tcEmotion);
          if ((VOICE_SPEEDS as readonly number[]).includes(Number(p.voiceSpeed))) setVoiceSpeed(Number(p.voiceSpeed));
          if ((PAUSE_OPTIONS as readonly number[]).includes(Number(p.maxPause))) setMaxPause(Number(p.maxPause));
        }
      } catch {
        /* 저장값 없음 */
      }
      setPrefsLoaded(true);
    });
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify({ ttsEngine, tcVoice, tcEmotion, voiceSpeed, maxPause }));
    } catch {
      /* 저장 못 해도 계속 */
    }
  }, [prefsLoaded, ttsEngine, tcVoice, tcEmotion, voiceSpeed, maxPause]);

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
      // v0.9.71: 고른 샤오홍슈 영상만으로 만든다 (AI 영상 생성 없음)
      const r = await api.videoProduction.plan({ contentId: content.id, scriptIndex, channelId, sourceMode: "xhs", videoIds, voice: ttsEngine === "typecast" ? tcVoice : voice, ttsEngine, ttsEmotion: tcEmotion, narrationOn, captions: captionsOn, voiceStyle, voiceSpeed, targetSec, maxPauseSec: maxPause, captionStyle, titleStyle, scriptText: scriptText ?? undefined, titleText: titleText.trim() || undefined, thumbText: thumbText.trim() || undefined });
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
      const blob = await api.videoProduction.voicePreview({ voice: ttsEngine === "typecast" ? tcVoice : voice, ttsEngine, ttsEmotion: tcEmotion, voiceStyle, voiceSpeed, channelId, text: content?.scripts[scriptIndex]?.split("\n").find((l) => l.trim())?.slice(0, 60) });
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

  async function render(p0: VideoPlan, rerenderOf?: string) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    // v0.9.78: 컷 계획을 만든 뒤 바꾼 스타일·음성 설정도 영상에 넣는다 (전에는 계획을 만들 때 값만 써서 글꼴을 바꿔도 그대로였다)
    const p: VideoPlan = {
      ...p0,
      titleStyle,
      captionStyle,
      captions: captionsOn,
      narrationOn,
      ttsEngine,
      voice: ttsEngine === "typecast" ? tcVoice || p0.voice : voice,
      ttsEmotion: tcEmotion,
      voiceStyle,
      voiceSpeed,
      targetSec,
      maxPauseSec: maxPause,
    };
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

  // v0.9.138 자동 제작 결과 편집: ?jobId= 로 열고, 다시 만든 영상이 끝나면 자동 제작 결과에 반영
  const linked = useRef<string | null>(null);
  useEffect(() => {
    if (initialJobId) void openJob(initialJobId);
  }, [initialJobId]);
  useEffect(() => {
    if (!autoLink || !job || job.id === initialJobId || linked.current === job.id) return;
    if (job.status !== "completed" && job.status !== "needs_review" && job.status !== "approved") return;
    linked.current = job.id;
    void fetch("/api/auto-video/item", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...autoLink, jobId: job.id }) })
      .then((r) => r.json())
      .then((j: { ok: boolean; error?: { message: string } }) => setError(j.ok ? null : (j.error?.message ?? "자동 제작 결과에 반영하지 못했습니다.")))
      .catch(() => setError("자동 제작 결과에 반영하지 못했습니다."));
  }, [autoLink, job, initialJobId]);
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
  const missing = [
    !opts.ready.voice && "AI 음성(OpenAI 연결) — 없으면 음성 없이 자막 시간으로 만듭니다",
    !opts.ready.vision && "원본 글자 검사(AI 이미지 읽기: Claude·OpenAI 연결) — 없으면 모든 컷이 검수 필요",
    !opts.assets.bgm.length && "배경음악 (assets/video/bgm)",
    !opts.assets.sfx.length && "효과음 (assets/video/sfx)",
    Object.values(opts.assets.fonts).some((v) => !v) && "글꼴 (assets/video/fonts — 도현체·주아체·레시피코리아체)",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6" data-video-production>
      <style>{FONT_FACES}</style>
      {missing.length > 0 && (
        <Notice tone="warning">
          아직 준비되지 않은 것: {missing.join(" · ")}. 빠진 것은 빼고 만듭니다.
        </Notice>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={leftOpen ? PanelLeftClose : PanelLeftOpen} onClick={() => setLeftOpen((v) => !v)} data-left-toggle>
          {leftOpen ? "왼쪽 접기 (결과 크게 보기)" : "왼쪽 펼치기"}
        </Button>
      </div>
      <div className={cn("grid items-start gap-6", leftOpen ? "xl:grid-cols-[440px_1fr]" : "grid-cols-1")}>
        <div className={cn("space-y-6", !leftOpen && "hidden")}>
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
                  <div className="grid gap-2 sm:grid-cols-2" data-video-titles>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-[12px] font-medium text-fg-muted">영상 제목 (업로드 제목)</span>
                      <Input value={titleText} onChange={(e) => setTitleText(e.target.value)} className="h-9 text-[13px]" aria-label="영상 제목" />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="flex items-center justify-between text-[12px] font-medium text-fg-muted">
                        섬네일 제목 (영상 상단 제목 2번째 줄 · 공백 빼고 {THUMB_MAX}자 이내)
                        <span className={thumbLen(thumbText) > THUMB_MAX ? "text-danger" : "text-fg-subtle"}>
                          {thumbLen(thumbText)}/{THUMB_MAX}
                        </span>
                      </span>
                      <Input value={thumbText} onChange={(e) => setThumbText(cutThumb(e.target.value) === e.target.value.trim() ? e.target.value : cutThumb(e.target.value))} className="h-9 text-[13px]" aria-label="섬네일 제목" />
                      {(content.thumbs ?? []).length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {(content.thumbs ?? []).map((t) => (
                            <button key={t} type="button" onClick={() => setThumbText(cutThumb(t))} className={cn("rounded-full border px-2 py-0.5 text-[11.5px]", thumbText === t ? "border-brand bg-brand-soft text-brand" : "border-line text-fg-muted hover:border-brand-line")}>
                              {t}
                            </button>
                          ))}
                        </span>
                      )}
                    </label>
                  </div>
                )}
                {content && (
                  <div className="space-y-2" data-script-picker>
                    {content.scripts.map((s, i) => (
                      <label
                        key={i}
                        className={cn("block cursor-pointer rounded-control border px-3 py-2 text-[12.5px]", scriptIndex === i ? "border-brand bg-brand-soft/50" : "border-line hover:bg-subtle")}
                      >
                        <span className="flex items-center gap-2 font-semibold text-fg">
                          <input type="radio" name="vp-script" checked={scriptIndex === i} onChange={() => (setScriptIndex(i), setScriptText(null))} className="accent-[var(--color-brand)]" />
                          대본 {i + 1}
                        </span>
                        <span className="mt-1 line-clamp-3 block whitespace-pre-line text-fg-muted">{s}</span>
                      </label>
                    ))}
                    <label className="block space-y-1" data-script-edit>
                      <span className="flex items-center gap-2 text-[12px] font-medium text-fg-muted">
                        대본 직접 고치기 {scriptText !== null && <Badge tone="brand">고침</Badge>}
                        {scriptText !== null && (
                          <button type="button" className="text-[11.5px] text-brand hover:underline" onClick={() => setScriptText(null)}>
                            원래대로
                          </button>
                        )}
                      </span>
                      <Textarea rows={8} value={scriptText ?? content.scripts[scriptIndex] ?? ""} onChange={(e) => setScriptText(e.target.value)} className="text-[13px] leading-relaxed" />
                      <span className="block text-[11.5px] text-fg-subtle">엔터 한 번 = 컷 하나 = 자막·음성 한 줄입니다. 줄 중간에서 나누지 않습니다. 고친 대본으로 [컷 계획 만들기]를 합니다.</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* ② 소재 */}
          <SectionCard title="② 영상 소재 · 음성" icon={Film}>
            <div className="space-y-4">
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
                  <>
                  <div className="mb-1.5 flex gap-1.5" data-source-bulk>
                    <Button size="sm" variant="ghost" onClick={() => setVideoIds(sourceVideos.map((v) => v.id))} disabled={videoIds.length === sourceVideos.length}>
                      전체 선택
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setVideoIds([])} disabled={!videoIds.length}>
                      전체 해제
                    </Button>
                  </div>
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
                  </>
                )}
              </FormField>
              <FormField label="영상 길이" hint="말하기 속도를 '자동'으로 두면 이 길이에 맞게 속도를 정합니다 (1~3배). 속도를 숫자로 고르면 그 속도 그대로 (길이는 대본에 따라). 기본은 대본을 만들 때 고른 길이." data-target-sec>
                <SegmentedControl
                  size="sm"
                  value={String(targetSec)}
                  onChange={(v) => setTargetSec(Number(v))}
                  options={VIDEO_TARGETS.map((x) => ({ value: String(x), label: x ? `${x}초` : "자동" }))}
                />
              </FormField>
              <FormField label="말 사이 무음 없애기" hint="AI 음성 안의 쉼이 이보다 길면 모두 줄입니다 (무음 구간 자르기와 같은 방식). 컷 사이도 0.04초만 둡니다." data-max-pause>
                <SegmentedControl
                  size="sm"
                  value={String(maxPause)}
                  onChange={(v) => setMaxPause(Number(v))}
                  options={PAUSE_OPTIONS.map((x) => ({ value: String(x), label: `${x}초 넘으면` }))}
                />
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
                <div className="grid gap-3 sm:grid-cols-2" data-voice-options>
                  <FormField label="음성 엔진" className="sm:col-span-2" hint={opts.ready.typecast ? undefined : "타입캐스트 목소리를 쓰려면 설정 › API 연결 센터에서 타입캐스트 키를 넣어 주세요."}>
                    <SegmentedControl
                      size="sm"
                      value={ttsEngine}
                      onChange={setTtsEngine}
                      options={[
                        { value: "openai", label: "OpenAI" },
                        { value: "typecast", label: "타입캐스트" },
                      ]}
                    />
                  </FormField>
                  {ttsEngine === "typecast" ? (
                    <div className="sm:col-span-2">
                      <TypecastVoicePicker channelId={channelId} ready={opts.ready.typecast} value={tcVoice} onChange={setTcVoice} emotion={tcEmotion} onEmotion={setTcEmotion} emotions={opts.typecastEmotions} />
                    </div>
                  ) : (
                    <>
                      <FormField label={`AI 음성 목소리 · ${opts.voices.length}가지`}>
                        <Select value={voice} options={opts.voices.map((v) => ({ value: v.value, label: v.label }))} onChange={(e) => setVoice(e.target.value)} />
                      </FormField>
                      <FormField label="말투">
                        <Select value={voiceStyle} options={opts.voiceStyles} onChange={(e) => setVoiceStyle(e.target.value)} />
                      </FormField>
                    </>
                  )}
                  <FormField label="말하기 속도" className="sm:col-span-2" hint={voiceSpeed === 0 ? (targetSec ? `영상 길이 ${targetSec}초에 맞게 속도를 정합니다 (1~3배).` : "영상 길이가 '자동'이라 보통 속도로 읽습니다.") : `${ttsEngine === "typecast" ? "타입캐스트" : "OpenAI"} 음성을 ${voiceSpeed === 1 ? "보통" : `${voiceSpeed}배`} 속도 그대로 씁니다 (음높이 그대로, 미리 듣기도 같은 속도).`} data-voice-speed>
                    <SegmentedControl
                      size="sm"
                      value={String(voiceSpeed)}
                      onChange={(v) => setVoiceSpeed(Number(v))}
                      options={VOICE_SPEEDS.map((x) => ({ value: String(x), label: x === 0 ? "자동" : x === 1 ? "보통" : `${x}배` }))}
                    />
                  </FormField>
                  <div className="sm:col-span-2">
                    <Button size="sm" icon={Play} loading={previewing} disabled={ttsEngine === "typecast" ? !opts.ready.typecast || !tcVoice : !opts.ready.voice} onClick={() => void previewVoice()} data-voice-preview>
                      미리 듣기
                    </Button>
                    <span className="ml-2 text-[11.5px] text-fg-subtle">{ttsEngine === "typecast" ? (tcVoice ? "고른 대본 첫 줄로 들려 줍니다 (타입캐스트 1회, 글자 수만큼 크레딧)." : "타입캐스트 목소리를 먼저 골라 주세요.") : opts.ready.voice ? "고른 대본 첫 줄로 들려 줍니다 (OpenAI 음성 1회)." : "OpenAI 키를 연결하면 들을 수 있습니다."}</span>
                    {voiceNote && <p className="mt-1 text-xs text-danger">{voiceNote}</p>}
                  </div>
                </div>
              )}
              <TitleStylePicker value={titleStyle} onChange={setTitleStyle} />
              {captionsOn && <CaptionStylePicker value={captionStyle} onChange={setCaptionStyle} />}
              {!narrationOn && <p className="-mt-2 text-xs text-fg-subtle">음성이 없으면 컷 길이는 자막 글자 수로 정합니다 (배경음악·효과음은 그대로).</p>}
              {error && !plan && <Notice tone="warning">{error}</Notice>}
              <Button variant="primary" icon={Wand2} loading={planning} disabled={!content || !videoIds.length || (narrationOn && ttsEngine === "typecast" && !tcVoice)} onClick={() => void makePlan()} className="w-full" data-make-plan>
                컷 계획 만들기
              </Button>
            </div>
          </SectionCard>
        </div>

        <div className="min-w-0 space-y-6">
          {job ? (
            <JobPanel key={`${job.id}:${job.updatedAt}`} job={job} plan={plan} videoTitle={videoTitle} videos={opts.videos} onRerender={(p) => void render(p, job.id)} onChange={setJob} channelId={channelId} giphyReady={Boolean(opts.ready.giphy)} wide={!leftOpen} sfxList={opts.assets.sfx.map((f) => f.replace(/\.[^.]+$/, ""))} />
          ) : plan ? (
            <PlanEditor
              plan={plan}
              onChange={setPlan}
              videos={opts.videos.filter((v) => plan.sourceVideoIds.includes(v.id))}
              onRender={() => void render(plan)}
              error={error}
              titleStyle={titleStyle}
              channelId={channelId}
              giphyReady={Boolean(opts.ready.giphy)}
              sfxList={opts.assets.sfx.map((f) => f.replace(/\.[^.]+$/, ""))}
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
  onRender,
  error,
  titleStyle,
  channelId,
  giphyReady,
  sfxList,
}: {
  plan: VideoPlan;
  onChange: (p: VideoPlan) => void;
  videos: VideoProductionOptions["videos"];
  onRender: () => void;
  error: string | null;
  /** 지금 고른 제목 스타일 (계획을 만든 뒤 바꿔도 미리보기에 반영) */
  titleStyle: TitleStyle;
  channelId: VideoChannel;
  /** GIPHY 연결됨 (v0.9.102) */
  giphyReady: boolean;
  sfxList: string[];
}) {
  const [gifFor, setGifFor] = useState<number | null>(null);
  const setScene = (i: number, patch: Partial<VideoPlan["scenes"][number]>) => onChange({ ...plan, scenes: plan.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  // v0.9.139 원본 구간 고르기
  const [startFor, setStartFor] = useState<number | null>(null);
  // v0.9.138 컷 추가·삭제 (번호는 다시 매김)
  const setScenes = (list: VideoPlan["scenes"]) => onChange({ ...plan, scenes: list.map((x, k) => ({ ...x, index: k })) });
  const addAfter = (i: number) => setScenes([...plan.scenes.slice(0, i + 1), { index: i + 1, narration: "", sfx: null, arrow: false, attention: false, sourceVideoId: plan.scenes[i]?.sourceVideoId ?? null }, ...plan.scenes.slice(i + 1)]);
  const removeAt = (i: number) => plan.scenes.length > 1 && setScenes(plan.scenes.filter((_, k) => k !== i));
  const clipOptions = videos.map((v) => ({ value: v.id, label: v.title.slice(0, 22) }));
  return (
    <SectionCard
      title={`③ 컷 계획 · ${plan.scenes.length}컷`}
      icon={Clapperboard}
      description="한 줄 = 한 컷 = 자막·음성 한 줄입니다 (대본의 엔터 기준). 대본·제목·클립 모두 고칠 수 있습니다. 3컷마다 효과음 + 제품 보기 화살표가 들어가고, 원본의 자막·로고는 화면을 확대해 가립니다."
      data-plan-editor
    >
      <div className="mb-4 overflow-hidden rounded-control border border-line">
        <div className="px-4 py-3 text-center" style={{ background: titleStyle.bar !== "none" ? titleStyle.bar : "#3f3f46" }}>
          <Input value={plan.topLine1} onChange={(e) => onChange({ ...plan, topLine1: e.target.value })} className="h-9 border-0 bg-transparent text-center text-lg" style={{ color: titleStyle.line1, ...previewFont(titleStyle.font) }} aria-label="상단 제목 1줄" />
          <Input value={plan.topLine2} onChange={(e) => onChange({ ...plan, topLine2: e.target.value })} className="h-8 border-0 bg-transparent text-center" style={{ color: titleStyle.line2, ...previewFont(titleStyle.font) }} aria-label="상단 제목 2줄" />
        </div>
        <p className="bg-subtle px-3 py-1.5 text-[11.5px] text-fg-subtle">상단 제목 (② 에서 고른 제목 스타일 · 2번째 줄의 [ ] 글자는 강조색). 선택한 제목: {plan.selectedTitle}</p>
        <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2" data-title-edit>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">상단 제목 1줄 (고치기)</span>
            <Input value={plan.topLine1} onChange={(e) => onChange({ ...plan, topLine1: e.target.value })} className="h-9" />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">상단 제목 2줄 — [ ] 로 감싼 글자는 강조색</span>
            <Input value={plan.topLine2} onChange={(e) => onChange({ ...plan, topLine2: e.target.value })} className="h-9" />
          </label>
        </div>
      </div>
      <GiphyPicker open={gifFor !== null} onClose={() => setGifFor(null)} channelId={channelId} sceneText={gifFor !== null ? plan.scenes[gifFor]?.narration ?? "" : ""} onPick={(g) => gifFor !== null && setScene(gifFor, { gif: g, attention: true })} />
      {startFor !== null && plan.scenes[startFor]?.sourceVideoId && (
        <SourceStartPicker
          videoId={plan.scenes[startFor].sourceVideoId!}
          videoTitle={videos.find((v) => v.id === plan.scenes[startFor].sourceVideoId)?.title ?? "원본"}
          value={plan.scenes[startFor].startAt ?? null}
          narration={plan.scenes[startFor].narration}
          onClose={() => setStartFor(null)}
          onSave={(sec) => {
            setScene(startFor, { startAt: sec, pinned: true });
            setStartFor(null);
          }}
        />
      )}
      <ol className="space-y-1.5">
        {plan.scenes.map((s, i) => (
          <li key={i} className="grid grid-cols-[28px_minmax(0,1fr)_200px] items-center gap-2 rounded-control border border-line px-2 py-1.5 text-[12.5px]" data-plan-scene>
            <span className="tabular text-center text-xs font-semibold text-fg-subtle">{i + 1}</span>
            <span className="min-w-0">
              <Input value={s.narration} onChange={(e) => setScene(i, { narration: e.target.value })} className="h-8 text-[13px]" aria-label={`${i + 1}번 컷 자막`} />
              <span className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-fg-subtle">
                <span className="inline-flex items-center gap-1" data-plan-sfx>
                  <button type="button" disabled={!sfxList.length} onClick={() => setScene(i, { sfx: s.sfx ? null : (sfxList[0] ?? null) })} className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset", s.sfx ? "bg-info-soft text-info ring-info/40" : "text-fg-subtle ring-line hover:bg-subtle")}>
                    {s.sfx ? "♪ 효과음" : "+ 효과음"}
                  </button>
                  {s.sfx && (
                    <select value={s.sfx} onChange={(e) => setScene(i, { sfx: e.target.value })} className="h-6 max-w-[150px] rounded border border-line bg-canvas px-1 text-[11px]" aria-label={`${i + 1}번 컷 효과음`}>
                      {[...new Set([s.sfx, ...sfxList])].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  )}
                </span>
                {i < plan.scenes.length - 1 && (
                  <button type="button" onClick={() => setScene(i, { arrow: !s.arrow })} className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset", s.arrow ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-subtle ring-line hover:bg-subtle")} data-arrow-toggle>
                    {s.arrow ? "↓ 제품 버튼 화살표" : "+ 화살표"}
                  </button>
                )}
                <button type="button" onClick={() => addAfter(i)} className="rounded-full px-2 py-0.5 text-[11px] text-fg-subtle ring-1 ring-inset ring-line hover:bg-subtle hover:text-brand" title="이 컷 아래에 새 컷 추가 (자막을 적어 주세요)" data-plan-add>
                  + 아래에 컷
                </button>
                {plan.scenes.length > 1 && (
                  <button type="button" onClick={() => removeAt(i)} className="rounded-full px-2 py-0.5 text-[11px] text-fg-subtle ring-1 ring-inset ring-line hover:bg-danger-soft hover:text-danger" data-plan-remove>
                    컷 삭제
                  </button>
                )}
                {i < plan.scenes.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setScene(i, { attention: !s.attention })}
                    className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset", s.attention ? "bg-warning-soft text-warning ring-warning/40" : "text-fg-subtle ring-line hover:bg-subtle")}
                    title="강조 컷에 통통 튀는 주목 스티커 (assets/video/meme 에 GIF 가 있으면 GIF)"
                    data-attention-toggle
                  >
                    {s.attention ? "✨ 주목 효과" : "+ 주목 효과"}
                  </button>
                )}
                {s.attention && i < plan.scenes.length - 1 && (
                  <span className="inline-flex items-center gap-1">
                    {s.gif && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.gif.preview} alt={s.gif.title} className="h-6 w-6 rounded object-contain ring-1 ring-line" />
                    )}
                    <button
                      type="button"
                      onClick={() => setGifFor(i)}
                      disabled={!giphyReady}
                      title={giphyReady ? "GIPHY 에서 이 컷의 주목 GIF 고르기" : "설정 › API 연결 센터에서 GIPHY 키를 넣으면 쓸 수 있습니다"}
                      className="rounded-full px-2 py-0.5 text-[11px] text-brand ring-1 ring-inset ring-brand/40 hover:bg-brand-soft disabled:cursor-not-allowed disabled:text-fg-subtle disabled:ring-line"
                      data-giphy-open
                    >
                      {s.gif ? "GIF 바꾸기" : "GIF 고르기"}
                    </button>
                    {s.gif && (
                      <button type="button" onClick={() => setScene(i, { gif: null })} className="text-[11px] text-fg-subtle hover:text-danger" aria-label="GIF 빼기">
                        ✕
                      </button>
                    )}
                  </span>
                )}
                {i === plan.scenes.length - 1 && plan.ending && <Badge tone="danger">최저가 구매링크</Badge>}
              </span>
            </span>
            <span className="space-y-1">
              <Select
                value={s.sourceVideoId ?? ""}
                options={clipOptions}
                onChange={(e) => setScene(i, { sourceVideoId: e.target.value, pinned: true, startAt: null })}
                aria-label={`${i + 1}번 컷 클립`}
              />
              {s.sourceVideoId && (
                <button type="button" onClick={() => setStartFor(i)} className={cn("w-full rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset", s.startAt != null ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-subtle ring-line hover:text-brand")} data-plan-start>
                  {s.startAt != null ? `구간 ${s.startAt}초부터` : "구간 고르기 (자동)"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>
      {error && <Notice tone="warning" className="mt-3">{error}</Notice>}
      <div className="mt-4 flex items-center justify-end gap-3">
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
  channelId,
  giphyReady,
  wide,
  sfxList,
}: {
  channelId: VideoChannel;
  giphyReady: boolean;
  wide: boolean;
  sfxList: string[];
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
  // v0.9.82: 제목·대본을 고쳤는지
  const textChanged = edited.topLine1 !== job.plan.topLine1 || edited.topLine2 !== job.plan.topLine2 || edited.scenes.some((s, i) => s.narration !== job.plan.scenes[i]?.narration);
  // v0.9.137: GIF·화살표 편집
  const fxChanged = edited.scenes.length !== job.plan.scenes.length || edited.scenes.some((s, i) => { const o = job.plan.scenes[i]; return !o || Boolean(s.attention) !== Boolean(o.attention) || s.arrow !== o.arrow || (s.gifPos ?? "top") !== (o.gifPos ?? "top") || (s.gifSize ?? "m") !== (o.gifSize ?? "m") || JSON.stringify(s.gifBox ?? null) !== JSON.stringify(o.gifBox ?? null) || (s.gif?.id ?? "") !== (o.gif?.id ?? "") || (s.startAt ?? null) !== (o.startAt ?? null) || (s.sfx ?? null) !== (o.sfx ?? null) || (s.gifSec ?? null) !== (o.gifSec ?? null); });
  // v0.9.139 편집기: GIF 검색(GIPHY)·끌어다 놓기
  const [gifFor, setGifFor] = useState<number | null>(null);
  const [placeFor, setPlaceFor] = useState<number | null>(null);
  const [startFor, setStartFor] = useState<number | null>(null);
  const setScene = (i: number, patch: Partial<VideoPlan["scenes"][number]>) => setEdited({ ...edited, scenes: edited.scenes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const pool = videos.filter((v) => job.plan.sourceVideoIds.includes(v.id)).map((v) => ({ value: v.id, label: v.title.slice(0, 20) }));

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
        <div className={cn("grid gap-5", wide ? "lg:grid-cols-[400px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]")}>
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
              길이 {job.qa.durationSec ?? "-"}초{job.qa.targetSec ? ` (목표 ${job.qa.targetSec}초)` : ""}{job.qa.voiceTempo && job.qa.voiceTempo !== 1 ? ` · 음성 ${job.qa.voiceTempo}배` : ""} · 효과음 {job.qa.sfxCount ?? 0}회 · 검은 화면 {job.qa.blackFrames ?? 0} · 긴 무음 {job.qa.longSilences ?? 0} · 음성 {job.qa.voice === "tts" ? "AI" : "없음"}
            </p>
            <div className="grid gap-2 sm:grid-cols-2" data-job-title>
              <label className="space-y-1">
                <span className="text-[11.5px] font-medium text-fg-muted">상단 제목 1줄</span>
                <Input value={edited.topLine1} onChange={(e) => setEdited({ ...edited, topLine1: e.target.value })} className="h-8 text-[13px]" />
              </label>
              <label className="space-y-1">
                <span className="text-[11.5px] font-medium text-fg-muted">상단 제목 2줄 ([ ] = 강조색)</span>
                <Input value={edited.topLine2} onChange={(e) => setEdited({ ...edited, topLine2: e.target.value })} className="h-8 text-[13px]" />
              </label>
            </div>
            <ol className="space-y-1" data-job-scenes>
              {edited.scenes.map((s, i) => (
                <li key={i} className={cn("grid grid-cols-[24px_minmax(0,1fr)_140px] items-center gap-2 rounded-control border px-2 py-1.5 text-[12px]", s.issue ? "border-warning bg-warning-soft/40" : "border-line")}>
                  <span className="tabular text-center text-fg-subtle">{i + 1}</span>
                  <span className="min-w-0">
                    <Input value={s.narration} onChange={(e) => setEdited({ ...edited, scenes: edited.scenes.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)) })} className="h-7 text-[12.5px]" aria-label={`${i + 1}번 컷 대본`} />
                    <span className="line-clamp-2 text-[11px] text-fg-subtle" title={s.issue ?? undefined}>
                      {s.start != null ? `${s.start.toFixed(1)}초 · ` : ""}
                      {TREATMENT_LABEL[s.textTreatment ?? "unchecked"]}
                      {s.issue ? ` · ${s.issue}` : ""}
                    </span>
                  </span>
                  <span className="space-y-1">
                    <Select
                      value={s.sourceVideoId ?? ""}
                      options={pool}
                      onChange={(e) => setEdited({ ...edited, scenes: edited.scenes.map((x, j) => (j === i ? { ...x, sourceVideoId: e.target.value, pinned: true, startAt: null } : x)) })}
                      aria-label={`${i + 1}번 컷 클립 교체`}
                    />
                    {s.sourceVideoId && (
                      <button type="button" onClick={() => setStartFor(i)} className={cn("w-full rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset", s.startAt != null ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-subtle ring-line hover:text-brand")} data-job-start>
                        {s.startAt != null ? `구간 ${s.startAt}초부터` : s.sourceStart != null ? `구간 ${s.sourceStart}초 (자동) · 바꾸기` : "구간 고르기"}
                      </button>
                    )}
                  </span>
                    {i < edited.scenes.length - 1 && (
                      <span className="col-span-3 flex flex-wrap items-center gap-2 pl-8 text-[11.5px]" data-job-fx>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={Boolean(s.attention)} onChange={(e) => setScene(i, { attention: e.target.checked })} className="accent-[var(--color-brand)]" />
                          {s.gif ? "GIF" : "주목 효과"}
                        </label>
                        {s.attention && (
                          <>
                            <button type="button" disabled={!giphyReady} onClick={() => setGifFor(i)} className="rounded-full px-2 py-0.5 text-brand ring-1 ring-inset ring-brand/40 hover:bg-brand-soft disabled:text-fg-subtle disabled:ring-line" title={giphyReady ? "GIPHY 에서 GIF 검색" : "설정 › API 연결 센터에서 GIPHY 키를 넣으면 쓸 수 있습니다"} data-job-giphy>
                              {s.gif ? "GIF 바꾸기 (검색)" : "GIF 검색"}
                            </button>
                            <button type="button" onClick={() => setPlaceFor(i)} className="rounded-full px-2 py-0.5 text-brand ring-1 ring-inset ring-brand/40 hover:bg-brand-soft" data-job-place>
                              화면에서 끌어다 놓기
                            </button>
                            {s.gifBox && (
                              <button type="button" onClick={() => setScene(i, { gifBox: null })} className="text-fg-subtle hover:text-danger" title="직접 놓은 자리를 지우고 위치·크기 선택으로">
                                ✕ 직접 놓은 자리
                              </button>
                            )}
                            <select value={s.gifPos ?? "top"} onChange={(e) => setScene(i, { gifPos: e.target.value as "top" | "center" | "bottom" })} className="h-6 rounded border border-line bg-canvas px-1" aria-label={`${i + 1}번 컷 GIF 위치`}>
                              {GIF_POSITIONS.map((x) => (
                                <option key={x.value} value={x.value}>
                                  위치 {x.label}
                                </option>
                              ))}
                            </select>
                            <select value={s.gifSize ?? "m"} onChange={(e) => setScene(i, { gifSize: e.target.value as "s" | "m" | "l" })} className="h-6 rounded border border-line bg-canvas px-1" aria-label={`${i + 1}번 컷 GIF 크기`}>
                              {GIF_SIZES.map((x) => (
                                <option key={x.value} value={x.value}>
                                  크기 {x.label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {s.attention && (
                          <label className="flex items-center gap-1" title="GIF 가 나오는 시간 (컷보다 길면 다음 컷 앞부분까지)">
                            GIF
                            <input type="number" min={0.5} max={8} step={0.5} value={s.gifSec ?? 2.6} onChange={(e) => setScene(i, { gifSec: Math.min(8, Math.max(0.5, Number(e.target.value) || 2.6)) })} className="h-6 w-14 rounded border border-line bg-canvas px-1" aria-label={`${i + 1}번 컷 GIF 초`} />초
                          </label>
                        )}
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={s.arrow} onChange={(e) => setScene(i, { arrow: e.target.checked })} className="accent-[var(--color-brand)]" />
                          화살표
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={Boolean(s.sfx)} disabled={!sfxList.length} onChange={(e) => setScene(i, { sfx: e.target.checked ? (s.sfx ?? sfxList[0] ?? null) : null })} className="accent-[var(--color-brand)]" />
                          효과음
                        </label>
                        {s.sfx && (
                          <select value={s.sfx} onChange={(e) => setScene(i, { sfx: e.target.value })} className="h-6 max-w-[160px] rounded border border-line bg-canvas px-1" aria-label={`${i + 1}번 컷 효과음`}>
                            {sfxList.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                    )}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant={changed || textChanged || fxChanged ? "primary" : "secondary"} icon={RefreshCw} onClick={() => onRerender(edited)} data-job-rerender>
                {textChanged ? "고친 제목·대본으로 다시 만들기" : changed || fxChanged ? "고친 내용으로 다시 만들기" : "다시 만들기"}
              </Button>
            </div>
            <p className="text-[11px] text-fg-subtle">원본 {[...new Set(job.plan.scenes.map((s) => s.sourceVideoId))].map(videoTitle).join(", ").slice(0, 120)}</p>
          </div>
        </div>
      )}
      <GiphyPicker open={gifFor !== null} onClose={() => setGifFor(null)} channelId={channelId} sceneText={gifFor !== null ? edited.scenes[gifFor]?.narration ?? "" : ""} onPick={(g) => gifFor !== null && setScene(gifFor, { gif: g, attention: true })} />
      {startFor !== null && edited.scenes[startFor]?.sourceVideoId && (
        <SourceStartPicker
          videoId={edited.scenes[startFor].sourceVideoId!}
          videoTitle={videoTitle(edited.scenes[startFor].sourceVideoId)}
          value={edited.scenes[startFor].startAt ?? edited.scenes[startFor].sourceStart ?? null}
          narration={edited.scenes[startFor].narration}
          onClose={() => setStartFor(null)}
          onSave={(sec) => {
            setScene(startFor, { startAt: sec, pinned: true });
            setStartFor(null);
          }}
        />
      )}
      {placeFor !== null && edited.scenes[placeFor] && (
        <GifPlacer
          videoUrl={job.fileUrl ?? null}
          at={(job.plan.scenes[placeFor]?.start ?? 0) + 0.4}
          gif={edited.scenes[placeFor].gif?.preview ?? null}
          box={edited.scenes[placeFor].gifBox ?? { x: 0.5, y: 0.35, w: 0.8 }}
          title={`${placeFor + 1}번 컷 · ${edited.scenes[placeFor].narration.slice(0, 20)}`}
          onClose={() => setPlaceFor(null)}
          onSave={(b) => {
            setScene(placeFor, { gifBox: b, attention: true });
            setPlaceFor(null);
          }}
        />
      )}
      {scheduleOpen && (
        <PublicationForm open onClose={() => setScheduleOpen(false)} editing={null} presetContentId={job.contentId ?? undefined} presetStatus="scheduled" onSaved={() => setScheduleOpen(false)} />
      )}
      {plan && null}
    </SectionCard>
  );
}

/**
 * v0.9.139 원본 구간 고르기: 컷에 쓸 샤오홍슈 영상을 재생해 보고 '지금 위치부터'를 그 컷의 시작으로.
 * 보관한 원본이 없으면 숫자로만 넣는다.
 */
function SourceStartPicker({ videoId, videoTitle, value, narration, onClose, onSave }: { videoId: string; videoTitle: string; value: number | null; narration: string; onClose: () => void; onSave: (sec: number | null) => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [sec, setSec] = useState<number>(value ?? 0);
  const ref = useRef<HTMLVideoElement>(null);
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" role="dialog" aria-label="원본 구간 고르기" data-source-start>
      <div className="w-full max-w-md space-y-3 rounded-card bg-canvas p-4 shadow-card">
        <p className="text-[14px] font-semibold">원본 구간 고르기 · {videoTitle}</p>
        <p className="text-[12px] text-fg-muted">이 컷 대사: {narration || "(없음)"}</p>
        {url === undefined ? (
          <p className="text-xs text-fg-subtle">원본을 불러오는 중…</p>
        ) : url ? (
          <video ref={ref} src={url} controls playsInline className="mx-auto max-h-[60vh] w-full rounded bg-black" onLoadedMetadata={(e) => (e.currentTarget.currentTime = sec)} onTimeUpdate={(e) => setSec(Number(e.currentTarget.currentTime.toFixed(1)))} />
        ) : (
          <p className="rounded bg-subtle p-3 text-[12px] text-fg-muted">이 영상은 원본이 보관되지 않아 미리볼 수 없습니다. 시작 초를 숫자로 넣어 주세요 (영상 제작·제품 영상 자동 제작 화면의 [보관 안 된 영상 원본 받아 두기]로 받으면 미리볼 수 있습니다).</p>
        )}
        <label className="flex items-center gap-2 text-[12.5px]">
          시작
          <Input type="number" min={0} step={0.1} value={sec} onChange={(e) => setSec(Math.max(0, Number(e.target.value) || 0))} className="h-8 w-24" aria-label="시작 초" />초부터 이 컷 길이만큼 씁니다
        </label>
        <div className="flex justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={() => onSave(null)}>
            자동으로 (지우기)
          </Button>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button size="sm" variant="primary" onClick={() => onSave(Number(sec.toFixed(1)))} data-source-start-save>
              {url ? "지금 위치부터 쓰기" : "이 초부터 쓰기"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * v0.9.139 GIF 끌어다 놓기 편집기: 완성 영상의 그 컷 화면 위에 GIF 를 끌어 놓고 크기를 정한다.
 * 저장하면 컷에 gifBox(가운데 x·y, 너비 — 화면 비율)를 넣고 [고친 내용으로 다시 만들기]로 영상에 반영.
 */
function GifPlacer({ videoUrl, at, gif, box, title, onClose, onSave }: { videoUrl: string | null; at: number; gif: string | null; box: { x: number; y: number; w: number }; title: string; onClose: () => void; onSave: (b: { x: number; y: number; w: number }) => void }) {
  const [b, setB] = useState(box);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !frame.current) return;
    const r = frame.current.getBoundingClientRect();
    setB((v) => ({ ...v, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4" role="dialog" aria-label="GIF 끌어다 놓기" data-gif-placer>
      <div className="w-full max-w-md space-y-3 rounded-card bg-canvas p-4 shadow-card">
        <p className="text-[14px] font-semibold">GIF 자리 정하기 · {title}</p>
        <div
          ref={frame}
          className="relative mx-auto aspect-[9/16] w-[300px] touch-none overflow-hidden rounded bg-black select-none"
          onPointerMove={move}
          onPointerUp={() => (drag.current = false)}
          onPointerLeave={() => (drag.current = false)}
        >
          {videoUrl ? <video src={videoUrl} muted playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" onLoadedMetadata={(e) => (e.currentTarget.currentTime = at)} /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">미리보기 없음</div>}
          <div
            className="absolute cursor-move ring-2 ring-brand"
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, transform: "translate(-50%, -50%)" }}
            onPointerDown={(e) => {
              drag.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            data-gif-handle
          >
            {gif ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gif} alt="GIF" draggable={false} className="pointer-events-none block w-full" />
            ) : (
              <div className="pointer-events-none flex aspect-video w-full items-center justify-center bg-warning-soft text-[12px] font-bold text-warning">주목 GIF</div>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[12.5px]">
          크기
          <input type="range" min={15} max={100} value={Math.round(b.w * 100)} onChange={(e) => setB({ ...b, w: Number(e.target.value) / 100 })} className="flex-1" aria-label="GIF 크기" />
          {Math.round(b.w * 100)}%
        </label>
        <p className="text-[11.5px] text-fg-subtle">GIF 를 마우스로 끌어 원하는 자리에 놓으세요. 미리보기 영상에는 이전 GIF 가 보일 수 있습니다 — 저장한 뒤 [고친 내용으로 다시 만들기]를 누르면 영상에 반영됩니다.</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" variant="primary" onClick={() => onSave({ x: Number(b.x.toFixed(3)), y: Number(b.y.toFixed(3)), w: Number(b.w.toFixed(3)) })} data-gif-place-save>
            이 자리로 저장
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 자막 글꼴·글자색·테두리색·크기 (v0.9.63) — 영상에는 서버가 같은 값으로 그린다 */
/** v0.9.122: 미리보기 글꼴 (영상과 같은 파일) — 이 부품을 다른 화면에서 쓸 때도 함께 넣는다 */
export function VideoFontFaces() {
  return <style>{FONT_FACES}</style>;
}

export function CaptionStylePicker({ value, onChange }: { value: CaptionStyle; onChange: (v: CaptionStyle) => void }) {
  const set = (patch: Partial<CaptionStyle>) => onChange({ ...value, ...patch });
  const shadow = value.stroke === "none" ? "none" : [-3, 3].flatMap((x) => [-3, 3].map((y) => `${x}px ${y}px 0 ${value.stroke}`)).join(",");
  return (
    <div className="space-y-2.5 rounded-control border border-line p-3" data-caption-style>
      <p className="text-[13px] font-semibold text-fg">자막 스타일</p>
      <div className="flex items-center justify-center rounded bg-gradient-to-b from-zinc-600 to-zinc-800 py-4">
        <span style={{ color: value.color, textShadow: shadow, fontSize: CAPTION_SIZES.find((x) => x.value === value.size)!.size / 3.2, ...previewFont(value.font) }} data-caption-preview>
          이거 하나면 청소 끝
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={value.font} options={CAPTION_FONTS.map((f) => ({ value: f.value, label: f.label }))} onChange={(e) => set({ font: e.target.value as CaptionStyle["font"] })} aria-label="자막 글꼴" />
        <SegmentedControl size="sm" value={value.size} onChange={(v) => set({ size: v })} options={CAPTION_SIZES.map((x) => ({ value: x.value, label: x.label }))} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">세로 위치</span>
        <SegmentedControl size="sm" value={value.position ?? "lower"} onChange={(v) => set({ position: v })} options={CAPTION_POSITIONS.map((x) => ({ value: x.value, label: x.label }))} />
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
      <p className="text-[11px] text-fg-subtle">미리보기도 영상과 같은 글꼴 파일로 보여 줍니다. 컷 계획을 만든 뒤에 바꿔도 [영상 만들기]에 그대로 들어갑니다.</p>
    </div>
  );
}

/** 상단 제목 스타일 (v0.9.64): 글꼴·1줄 색·2줄 색·띠 색 */
export function TitleStylePicker({ value, onChange }: { value: TitleStyle; onChange: (v: TitleStyle) => void }) {
  const set = (patch: Partial<TitleStyle>) => onChange({ ...value, ...patch });
  const swatches = (key: "line1" | "line2") => (
    <>
      {CAPTION_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => set({ [key]: c })} aria-label={`${key === "line1" ? "1줄" : "2줄"} 색 ${c}`} className={cn("size-6 rounded-full border", value[key] === c ? "ring-2 ring-brand ring-offset-1" : "border-line")} style={{ background: c }} />
      ))}
      <input type="color" value={value[key]} onChange={(e) => set({ [key]: e.target.value.toUpperCase() })} aria-label={`${key === "line1" ? "1줄" : "2줄"} 색 직접 고르기`} className="size-7 cursor-pointer rounded border border-line bg-transparent" />
    </>
  );
  const outline = value.bar === "none" ? "-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000" : "none";
  return (
    <div className="space-y-2.5 rounded-control border border-line p-3" data-title-style>
      <p className="text-[13px] font-semibold text-fg">상단 제목 스타일</p>
      <div className="rounded py-2 text-center" style={{ background: value.bar === "none" ? "linear-gradient(#71717a,#3f3f46)" : value.bar, ...previewFont(value.font) }} data-title-preview>
        <p style={{ color: value.line1, textShadow: outline }} className="text-[17px]">
          소니 WH-CH720N
        </p>
        <p style={{ color: value.line2, textShadow: outline }} className="text-[18px]">
          스펙보다 <span style={{ color: value.accent }}>먼저</span> 볼 게 있다?
        </p>
      </div>
      <Select value={value.font} options={CAPTION_FONTS.map((f) => ({ value: f.value, label: f.label }))} onChange={(e) => set({ font: e.target.value as TitleStyle["font"] })} aria-label="제목 글꼴" />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">1줄 색</span>
        {swatches("line1")}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">2줄 색</span>
        {swatches("line2")}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">강조색</span>
        {CAPTION_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => set({ accent: c })} aria-label={`강조색 ${c}`} className={cn("size-6 rounded-full border", value.accent === c ? "ring-2 ring-brand ring-offset-1" : "border-line")} style={{ background: c }} />
        ))}
        <input type="color" value={value.accent ?? "#FFE94D"} onChange={(e) => set({ accent: e.target.value.toUpperCase() })} aria-label="강조색 직접 고르기" className="size-7 cursor-pointer rounded border border-line bg-transparent" />
      </div>
      <p className="text-[11px] text-fg-subtle"><b>2번째 줄</b>에서 <b>[ ]</b>로 감싼 글자는 강조색으로 나옵니다. 예: 스펙보다 [먼저] 볼 게 있다? (1번째 줄은 한 색)</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-fg-subtle">띠 색</span>
        {TITLE_BAR_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => set({ bar: c })}
            aria-label={c === "none" ? "띠 없음" : `띠 색 ${c}`}
            className={cn("flex size-6 items-center justify-center rounded-full border text-[9px] text-fg-subtle", value.bar === c ? "ring-2 ring-brand ring-offset-1" : "border-line")}
            style={c === "none" ? undefined : { background: c }}
          >
            {c === "none" ? "없음" : ""}
          </button>
        ))}
        {value.bar !== "none" && <input type="color" value={value.bar} onChange={(e) => set({ bar: e.target.value.toUpperCase() })} aria-label="띠 색 직접 고르기" className="size-7 cursor-pointer rounded border border-line bg-transparent" />}
      </div>
    </div>
  );
}

/** 타입캐스트 목소리 고르기 (v0.9.73): 목록(무료, 1시간 기억)에서 이름으로 찾아 샘플을 듣고 고르거나, 목소리 ID 를 직접 넣는다 */
export function TypecastVoicePicker({
  channelId,
  ready,
  value,
  onChange,
  emotion,
  onEmotion,
  emotions,
}: {
  channelId: VideoChannel;
  ready: boolean;
  value: string;
  onChange: (id: string) => void;
  emotion: string;
  onEmotion: (v: string) => void;
  emotions: readonly { value: string; label: string }[];
}) {
  type V = Awaited<ReturnType<typeof api.videoProduction.typecastVoices>>[number];
  const [list, setList] = useState<V[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  async function load() {
    if (loading) return;
    setLoading(true);
    setErr(null);
    try {
      setList(await api.videoProduction.typecastVoices(channelId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "목소리 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }
  function sample(url: string | null) {
    if (!url) return;
    audio.current?.pause();
    audio.current = new Audio(url);
    void audio.current.play();
  }
  const key = q.trim().toLowerCase();
  const shown = (list ?? []).filter((v) => !key || v.name.toLowerCase().includes(key) || v.id.includes(key)).slice(0, 60);
  const picked = list?.find((v) => v.id === value);

  return (
    <div className="space-y-2.5 rounded-control border border-line p-3" data-typecast-picker>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-semibold text-fg">타입캐스트 목소리</p>
        {value && <Badge tone="brand">{picked ? picked.name : value}</Badge>}
        <span className="ml-auto">
          <Button size="sm" icon={RefreshCw} loading={loading} disabled={!ready} onClick={() => void load()} data-typecast-load>
            {list ? "다시 불러오기" : "목소리 목록 불러오기"}
          </Button>
        </span>
      </div>
      {list && (
        <>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`이름·ID로 찾기 (한국어로 읽을 수 있는 목소리 ${list.length}개)`} aria-label="타입캐스트 목소리 찾기" className="h-9" />
          <ul className="max-h-60 space-y-1 overflow-y-auto" data-typecast-voices>
            {shown.map((v) => (
              <li key={v.id}>
                <div className={cn("flex items-center gap-2 rounded-control px-2 py-1.5 text-[12.5px]", v.id === value ? "bg-brand-soft/60" : "hover:bg-subtle")}>
                  <button type="button" onClick={() => sample(v.previewUrl)} disabled={!v.previewUrl} aria-label={`${v.name} 샘플 듣기`} className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-fg-subtle hover:text-brand disabled:opacity-40">
                    <Play className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => onChange(v.id)} className="min-w-0 flex-1 text-left">
                    <span className="font-medium text-fg">{v.name}</span>
                    <span className="ml-1.5 text-[11px] text-fg-subtle">
                      {[v.gender === "female" ? "여성" : v.gender === "male" ? "남성" : null, v.age, v.custom ? "내 목소리" : null, ...v.useCases.slice(0, 2)].filter(Boolean).join(" · ")}
                    </span>
                    <span className="block font-mono text-[10.5px] text-fg-subtle" data-typecast-id>{v.id}</span>
                  </button>
                  {v.id === value && <Check className="size-4 shrink-0 text-brand" />}
                </div>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-3 text-xs text-fg-subtle">찾는 목소리가 없습니다.</li>}
          </ul>
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={value} onChange={(e) => onChange(e.target.value.trim())} placeholder="목소리 ID 직접 넣기 (tc_…)" aria-label="타입캐스트 목소리 ID" className="h-9 font-mono text-[12px]" />
        <Select value={emotion} options={emotions.map((e) => ({ value: e.value, label: `감정 · ${e.label}`}))} onChange={(e) => onEmotion(e.target.value)} aria-label="타입캐스트 감정" />
      </div>
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="text-[11px] text-fg-subtle">[목록 불러오기]는 한국어로 읽을 수 있는 목소리만 보여 줍니다. 이름을 찾아 ▶로 샘플을 듣고 누르면 ID(tc_…)가 자동으로 들어갑니다. 타입캐스트 사이트에서 고르려면 studio.typecast.ai/developers/api/voices (로그인) 에서 목소리의 Voice ID 를 복사해 직접 넣으세요. 1글자 = 1크레딧 · 무료 플랜은 상업적 사용 불가.</p>
    </div>
  );
}
